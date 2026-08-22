package main

import (
	"encoding/binary"
	"math"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type MatchPhase uint8

const (
	MaxPlayers  = 1000
	PingTimeout = 15 * time.Second

	PlayerSpeed         = 200.0
	MapHalfSize float32 = 2000

	MinEnergyGain float32 = 1
	MaxEnergyGain float32 = 10
	EnergyRange   float32 = 1000

	DashCooldownDuration float32 = 0.75
	DashEnergyCost       float32 = 25
	DashForce            float32 = 700
	KnockbackDecay       float32 = 6

	MatchDuration  float32    = 10 * 60
	PhaseSupernova MatchPhase = 1
	PhaseBlackHole MatchPhase = 2
	PhaseFinished  MatchPhase = 3

	BlackHolePullStart       float32 = 300
	BlackHolePullMax         float32 = 1200
	BlackHoleRampTime        float32 = 20
	BlackHoleGrowthPerSecond float32 = 60
)

type Game struct {
	mu sync.RWMutex

	Players      map[uint16]*Player
	nextPlayerID uint16

	Sun Sun

	FinishedTime float32
	MatchTime    float32
	Phase        MatchPhase
}

func NewGame() *Game {
	return &Game{
		Players: make(map[uint16]*Player),

		Sun: Sun{
			X:                  0,
			Y:                  0,
			Radius:             150,
			StartRadius:        150,
			EndRadius:          700,
			BlackHoleRadius:    80,
			BlackHoleMaxRadius: 500,
		},

		Phase: PhaseSupernova,
	}
}

func (g *Game) Update(dt float64) {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.MatchTime += float32(dt)
	progress := g.MatchTime / MatchDuration

	if progress > 1 {
		progress = 1
	}

	g.MatchTime += float32(dt)

	if g.MatchTime >= MatchDuration {
		g.Phase = PhaseBlackHole
	}

	if g.Phase == PhaseSupernova {
		progress := g.MatchTime / MatchDuration

		if progress > 1 {
			progress = 1
		}

		g.Sun.Radius =
			g.Sun.StartRadius +
				(g.Sun.EndRadius-g.Sun.StartRadius)*progress
	}

	if g.Phase == PhaseBlackHole {
		g.Sun.BlackHoleRadius += BlackHoleGrowthPerSecond * float32(dt)

		if g.Sun.BlackHoleRadius > g.Sun.BlackHoleMaxRadius {
			g.Sun.BlackHoleRadius = g.Sun.BlackHoleMaxRadius
		}
	}

	for _, player := range g.Players {
		if !player.Alive {
			continue
		}

		if player.DashCooldown > 0 {
			player.DashCooldown -= float32(dt)

			if player.DashCooldown < 0 {
				player.DashCooldown = 0
			}
		}

		if player.DashRequested {
			inputX := float32(player.InputX) / 127.0
			inputY := float32(player.InputY) / 127.0

			length := float32(math.Sqrt(float64(inputX*inputX + inputY*inputY)))

			if player.Energy >= DashEnergyCost && player.DashCooldown == 0 && length > 0 {
				inputX /= length
				inputY /= length

				player.KnockbackX += inputX * DashForce
				player.KnockbackY += inputY * DashForce

				player.Energy -= DashEnergyCost
				player.DashCooldown = DashCooldownDuration
			}

			player.DashRequested = false
		}

		inputX := float64(player.InputX) / 127.0
		inputY := float64(player.InputY) / 127.0

		length := math.Hypot(inputX, inputY)

		if length > 1 {
			inputX /= length
			inputY /= length
		}

		player.VX = float32(inputX * PlayerSpeed)
		player.VY = float32(inputY * PlayerSpeed)

		player.X += (player.VX + player.KnockbackX) * float32(dt)
		player.Y += (player.VY + player.KnockbackY) * float32(dt)

		player.KnockbackX -= player.KnockbackX * KnockbackDecay * float32(dt)
		player.KnockbackY -= player.KnockbackY * KnockbackDecay * float32(dt)

		if player.X < -MapHalfSize {
			player.X = -MapHalfSize
		}
		if player.X > MapHalfSize {
			player.X = MapHalfSize
		}

		if player.Y < -MapHalfSize {
			player.Y = -MapHalfSize
		}
		if player.Y > MapHalfSize {
			player.Y = MapHalfSize
		}

		dx := player.X - g.Sun.X
		dy := player.Y - g.Sun.Y

		if g.Phase == PhaseBlackHole {
			dx := g.Sun.X - player.X
			dy := g.Sun.Y - player.Y

			distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))

			if distance > 0 {
				nx := dx / distance
				ny := dy / distance

				blackHoleTime := g.MatchTime - MatchDuration

				pullProgress := blackHoleTime / BlackHoleRampTime

				if pullProgress > 1 {
					pullProgress = 1
				}

				pullStrength :=
					BlackHolePullStart +
						(BlackHolePullMax-BlackHolePullStart)*pullProgress

				player.KnockbackX += nx * pullStrength * float32(dt)
				player.KnockbackY += ny * pullStrength * float32(dt)
			}

			if distance <= g.Sun.BlackHoleRadius+player.Radius {
				g.killPlayer(player, DeathBySun)
				continue
			}
		}

		distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))

		if distance < EnergyRange {
			factor := 1 - (distance / EnergyRange)

			gainPerSecond := MinEnergyGain +
				(MaxEnergyGain-MinEnergyGain)*factor

			player.Energy += gainPerSecond * float32(dt)
		}

		player.SizeLevel = sizeLevelForEnergy(player.Energy)
		player.Radius = radiusForSizeLevel(player.SizeLevel)

		if g.Phase == PhaseSupernova && distance <= g.Sun.Radius+player.Radius {
			g.killPlayer(player, DeathByBlackHole)
			continue
		}
	}

	g.handlePlayerCollisions()

	aliveCount := 0

	for _, player := range g.Players {
		if player.Alive {
			aliveCount++
		}
	}

	if g.Phase == PhaseBlackHole && aliveCount == 0 {
		g.Phase = PhaseFinished
	}

	if g.Phase == PhaseFinished {
		g.FinishedTime += float32(dt)

		if g.FinishedTime >= 5 {
			g.FinishedTime = 0
			g.ResetMatch()
		}

		return
	}
}

func (g *Game) BuildWorldState() []byte {
	g.mu.RLock()
	defer g.mu.RUnlock()

	playerCount := 0

	for _, player := range g.Players {
		if player.Alive {
			playerCount++
		}
	}

	buf := make([]byte, 3+(playerCount*15))

	buf[0] = PacketWorldState
	binary.BigEndian.PutUint16(buf[1:3], uint16(playerCount))

	offset := 3

	for _, player := range g.Players {
		if !player.Alive {
			continue
		}

		binary.BigEndian.PutUint16(
			buf[offset:offset+2],
			player.ID,
		)
		offset += 2

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.X),
		)
		offset += 4

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.Y),
		)
		offset += 4

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.Energy),
		)
		offset += 4

		buf[offset] = player.SizeLevel
		offset++
	}

	return buf
}

func (g *Game) BroadcastWorldState() {
	data := g.BuildWorldState()

	g.mu.RLock()
	defer g.mu.RUnlock()

	for _, player := range g.Players {
		select {
		case player.Send <- data:
		default:
			// Player is too slow; skip this update.
		}
	}
}

func (g *Game) randomSpawnPositionLocked() (float32, float32) {
	const maxAttempts = 100

	for range maxAttempts {
		x := float32(rand.Float64()*float64(MapHalfSize*2) - float64(MapHalfSize))
		y := float32(rand.Float64()*float64(MapHalfSize*2) - float64(MapHalfSize))

		dx := x - g.Sun.X
		dy := y - g.Sun.Y

		distanceToSun := float32(math.Sqrt(float64(dx*dx + dy*dy)))

		if distanceToSun <= g.Sun.Radius+200 {
			continue
		}

		valid := true

		for _, existing := range g.Players {
			if !existing.Alive {
				continue
			}

			dx := x - existing.X
			dy := y - existing.Y

			distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))

			if distance < existing.Radius+100 {
				valid = false
				break
			}
		}

		if valid {
			return x, y
		}
	}
	return g.fallbackSpawnPositionLocked()
}

func (g *Game) fallbackSpawnPositionLocked() (float32, float32) {
	candidates := [][2]float32{
		{-MapHalfSize + 100, -MapHalfSize + 100},
		{MapHalfSize - 100, -MapHalfSize + 100},
		{-MapHalfSize + 100, MapHalfSize - 100},
		{MapHalfSize - 100, MapHalfSize - 100},
	}

	bestX := candidates[0][0]
	bestY := candidates[0][1]
	bestDistance := float32(-1)

	for _, candidate := range candidates {
		x := candidate[0]
		y := candidate[1]

		nearestPlayerDistance := float32(math.MaxFloat32)

		for _, player := range g.Players {
			if !player.Alive {
				continue
			}

			dx := x - player.X
			dy := y - player.Y

			distance := float32(math.Sqrt(
				float64(dx*dx + dy*dy),
			))

			if distance < nearestPlayerDistance {
				nearestPlayerDistance = distance
			}
		}

		if nearestPlayerDistance > bestDistance {
			bestDistance = nearestPlayerDistance
			bestX = x
			bestY = y
		}
	}

	return bestX, bestY
}

func (g *Game) handlePlayerCollisions() {
	players := make([]*Player, 0, len(g.Players))

	for _, player := range g.Players {
		if player.Alive {
			players = append(players, player)
		}
	}

	for i := 0; i < len(players); i++ {
		for j := i + 1; j < len(players); j++ {
			a := players[i]
			b := players[j]

			if !a.Alive || !b.Alive {
				continue
			}

			dx := b.X - a.X
			dy := b.Y - a.Y

			distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))
			minDistance := a.Radius + b.Radius

			if distance >= minDistance || distance == 0 {
				continue
			}

			nx := dx / distance
			ny := dy / distance

			overlap := minDistance - distance
			push := overlap / 2

			a.X -= nx * push
			a.Y -= ny * push

			b.X += nx * push
			b.Y += ny * push

			baseBounce := float32(250)

			totalRadius := a.Radius + b.Radius

			aForce := baseBounce * (b.Radius / totalRadius)
			bForce := baseBounce * (a.Radius / totalRadius)

			a.KnockbackX -= nx * aForce
			a.KnockbackY -= ny * aForce

			b.KnockbackX += nx * bForce
			b.KnockbackY += ny * bForce
		}
	}
}

func (g *Game) BuildRadarPacket() []byte {
	g.mu.RLock()
	defer g.mu.RUnlock()

	players := make([]*Player, 0, len(g.Players))

	for _, player := range g.Players {
		if player.Alive {
			players = append(players, player)
		}
	}

	sort.Slice(players, func(i, j int) bool {
		return players[i].Energy > players[j].Energy
	})

	if len(players) > 10 {
		players = players[:10]
	}

	buf := make([]byte, 2+(len(players)*10))

	buf[0] = PacketRadar
	buf[1] = byte(len(players))

	offset := 2

	for _, player := range players {
		binary.BigEndian.PutUint16(
			buf[offset:offset+2],
			player.ID,
		)
		offset += 2

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.X),
		)
		offset += 4

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.Y),
		)
		offset += 4
	}

	return buf
}

func (g *Game) BroadcastRadar() {
	data := g.BuildRadarPacket()

	g.mu.RLock()
	defer g.mu.RUnlock()

	for _, player := range g.Players {
		select {
		case player.Send <- data:
		default:
			// Slow client: skip this radar update.
		}
	}
}

func (g *Game) BroadcastMatchState() {
	g.mu.RLock()
	data := buildMatchStatePacket(g)

	players := make([]*Player, 0, len(g.Players))
	for _, player := range g.Players {
		players = append(players, player)
	}
	g.mu.RUnlock()

	for _, player := range players {
		select {
		case player.Send <- data:
		default:
		}
	}
}

func (g *Game) ResetMatch() {
	g.MatchTime = 0
	g.Phase = PhaseSupernova
	g.FinishedTime = 0

	g.Sun.Radius = g.Sun.StartRadius
	g.Sun.BlackHoleRadius = 80

	for _, player := range g.Players {
		player.Alive = false
	}

	for _, player := range g.Players {
		spawnX, spawnY := g.randomSpawnPositionLocked()

		player.X = spawnX
		player.Y = spawnY

		player.VX = 0
		player.VY = 0
		player.KnockbackX = 0
		player.KnockbackY = 0

		player.InputX = 0
		player.InputY = 0

		player.Energy = 100
		player.SizeLevel = 1
		player.Radius = 16

		player.DashRequested = false
		player.DashCooldown = 0

		player.Alive = false
	}
}

func (g *Game) RemovePlayer(id uint16) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, exists := g.Players[id]; !exists {
		return false
	}

	delete(g.Players, id)

	return true
}

func (g *Game) AddPlayer(player *Player) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	if len(g.Players) >= MaxPlayers {
		return false
	}

	var playerID uint16

	foundID := false

	for i := 0; i < 65535; i++ {
		g.nextPlayerID++

		if g.nextPlayerID == 0 {
			g.nextPlayerID = 1
		}

		if _, exists := g.Players[g.nextPlayerID]; exists {
			continue
		}

		playerID = g.nextPlayerID
		foundID = true
		break
	}

	if !foundID {
		return false
	}

	spawnX, spawnY := g.randomSpawnPositionLocked()

	player.ID = playerID
	player.X = spawnX
	player.Y = spawnY

	g.Players[player.ID] = player

	return true
}

func (g *Game) killPlayer(player *Player, reason DeathReason) {
	if !player.Alive {
		return
	}

	player.Alive = false

	select {
	case player.Send <- buildDeathPacket(reason):
	default:
	}
}

func (g *Game) RemoveTimedOutPlayers() {
	now := time.Now()

	var timedOut []*Player

	g.mu.Lock()

	for id, player := range g.Players {
		if now.Sub(player.LastPingTime()) > PingTimeout {
			delete(g.Players, id)
			timedOut = append(timedOut, player)
		}
	}

	g.mu.Unlock()

	for _, player := range timedOut {
		player.CloseDone()

		player.Conn.Close(
			websocket.StatusGoingAway,
			"ping timeout",
		)
	}
}

func (p *Player) CloseDone() {
	select {
	case <-p.Done:
		// already closed
	default:
		close(p.Done)
	}
}
