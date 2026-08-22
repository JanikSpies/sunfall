package game

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
