package game

import (
	"math"
	"math/rand"
)

// AddPlayer registers a new connection. If the incoming player carries a
// SessionID that matches an already-connected player (a client reconnecting
// after a brief network drop, before the server noticed the old socket was
// dead), it resumes that identity instead of spawning a duplicate: same ID
// and gameplay state, just handed to the new connection. The old connection
// is then torn down via RequestDisconnect so its own cleanup finds it has
// already been superseded (see RemovePlayer) and leaves the resumed player alone.
func (g *Game) AddPlayer(player *Player) bool {
	g.mu.Lock()

	if player.SessionID != "" {
		for _, old := range g.Players {
			if old.SessionID != player.SessionID {
				continue
			}

			player.ID = old.ID
			player.X = old.X
			player.Y = old.Y
			player.VX = old.VX
			player.VY = old.VY
			player.KnockbackX = old.KnockbackX
			player.KnockbackY = old.KnockbackY
			player.Rotation = old.Rotation
			player.Alive = old.Alive
			player.DashCooldown = old.DashCooldown
			player.Energy = old.Energy
			player.EnergyDepletedFor = old.EnergyDepletedFor
			player.Radius = old.Radius
			player.SizeLevel = old.SizeLevel

			g.Players[player.ID] = player

			g.mu.Unlock()

			old.RequestDisconnect()

			return true
		}
	}

	if len(g.Players) >= MaxPlayers {
		g.mu.Unlock()
		return false
	}

	defer g.mu.Unlock()

	var playerID uint16

	foundID := false

	for range 65535 {
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

	occupied := NewCollisionGrid()
	occupied.Rebuild(g.Players)

	spawnX, spawnY := g.randomSpawnPositionLocked(occupied)

	player.ID = playerID
	player.X = spawnX
	player.Y = spawnY
	player.Rotation = randomSpawnRotation()
	player.Alive = g.Phase == PhaseSupernova
	player.EnergyDepletedFor = 0

	g.Players[player.ID] = player

	return true
}

func randomSpawnRotation() float32 {
	return float32(rand.Float64() * 2 * math.Pi)
}

func (g *Game) randomSpawnPositionLocked(occupied *CollisionGrid) (float32, float32) {
	const maxAttempts = 100

	for range maxAttempts {
		maximumRadius := g.Sun.Radius + MaxSpawnBuffer
		minimumRadius := g.Sun.Radius + MinSpawnBuffer
		radiusSquared := float64(minimumRadius*minimumRadius) +
			rand.Float64()*float64(maximumRadius*maximumRadius-minimumRadius*minimumRadius)
		radius := math.Sqrt(radiusSquared)
		angle := rand.Float64() * 2 * math.Pi
		x := float32(math.Cos(angle) * radius)
		y := float32(math.Sin(angle) * radius)

		distanceToSun := float32(math.Sqrt(float64(x*x + y*y)))

		if distanceToSun <= g.Sun.Radius+200 {
			continue
		}

		if occupied.AnyPlayerWithin(x, y, 100) {
			continue
		}

		return x, y
	}
	return g.fallbackSpawnPositionLocked()
}

func (g *Game) fallbackSpawnPositionLocked() (float32, float32) {
	spawnRadius := g.Sun.Radius + MaxSpawnBuffer
	bestX := spawnRadius
	bestY := float32(0)
	bestDistance := float32(-1)

	for index := range 8 {
		angle := float64(index) * 2 * math.Pi / 8
		x := float32(math.Cos(angle)) * spawnRadius
		y := float32(math.Sin(angle)) * spawnRadius

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
