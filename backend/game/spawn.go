package game

import (
	"math"
	"math/rand"
)

func (g *Game) AddPlayer(player *Player) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	if len(g.Players) >= MaxPlayers {
		return false
	}

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
		minimumRadius := g.Sun.Radius + 200
		radiusSquared := float64(minimumRadius*minimumRadius) +
			rand.Float64()*float64(SpawnRadius*SpawnRadius-minimumRadius*minimumRadius)
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
	bestX := SpawnRadius
	bestY := float32(0)
	bestDistance := float32(-1)

	for index := range 8 {
		angle := float64(index) * 2 * math.Pi / 8
		x := float32(math.Cos(angle)) * SpawnRadius
		y := float32(math.Sin(angle)) * SpawnRadius

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
