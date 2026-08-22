package main

import (
	"encoding/binary"
	"math"
	"math/rand"
	"sort"
	"sync"
)

type MatchPhase uint8

const (
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
)

type Game struct {
	mu sync.RWMutex

	Players      map[uint32]*Player
	nextPlayerID uint32

	Sun Sun

	MatchTime float32
	Phase     MatchPhase
}

func NewGame() *Game {
	return &Game{
		Players: make(map[uint32]*Player),

		Sun: Sun{
			X:           0,
			Y:           0,
			Radius:      150,
			StartRadius: 150,
			EndRadius:   700,
		},

		Phase: PhaseSupernova,
	}
}

func (g *Game) NextPlayerID() uint32 {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.nextPlayerID++

	return g.nextPlayerID
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

		distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))

		if distance < EnergyRange {
			factor := 1 - (distance / EnergyRange)

			gainPerSecond := MinEnergyGain +
				(MaxEnergyGain-MinEnergyGain)*factor

			player.Energy += gainPerSecond * float32(dt)
		}

		player.SizeLevel = sizeLevelForEnergy(player.Energy)
		player.Radius = radiusForSizeLevel(player.SizeLevel)

		if distance <= g.Sun.Radius+player.Radius {
			player.Alive = false

			select {
			case player.Send <- buildDeathPacket():
			default:
			}

			continue
		}
	}

	g.handlePlayerCollisions()
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

	buf := make([]byte, 3+(playerCount*17))

	buf[0] = PacketWorldState
	binary.BigEndian.PutUint16(buf[1:3], uint16(playerCount))

	offset := 3

	for _, player := range g.Players {
		if !player.Alive {
			continue
		}

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			player.ID,
		)
		offset += 4

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

func (g *Game) RandomSpawnPosition() (float32, float32) {
	for {
		x := float32(rand.Float64()*float64(MapHalfSize*2) - float64(MapHalfSize))
		y := float32(rand.Float64()*float64(MapHalfSize*2) - float64(MapHalfSize))

		dx := x - g.Sun.X
		dy := y - g.Sun.Y

		distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))

		if distance > g.Sun.Radius+200 {
			return x, y
		}
	}
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

	buf := make([]byte, 2+(len(players)*12))

	buf[0] = PacketRadar
	buf[1] = byte(len(players))

	offset := 2

	for _, player := range players {
		binary.BigEndian.PutUint32(buf[offset:offset+4], player.ID)
		offset += 4

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
