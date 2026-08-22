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

	spawnX, spawnY := g.randomSpawnPositionLocked()

	player.ID = playerID
	player.X = spawnX
	player.Y = spawnY
	player.Rotation = randomSpawnRotation()
	player.Alive = g.Phase == PhaseSupernova

	g.Players[player.ID] = player

	return true
}

func randomSpawnRotation() float32 {
	return float32(rand.Float64() * 2 * math.Pi)
}

func (g *Game) randomSpawnPositionLocked() (float32, float32) {
	const maxAttempts = 100

	for range maxAttempts {
		x := float32(rand.Float64()*float64(MapHalfSize*2) - float64(MapHalfSize))
		y := float32(rand.Float64()*float64(MapHalfSize*2) - float64(MapHalfSize))

		distanceToSun := float32(math.Sqrt(float64(x*x + y*y)))

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
