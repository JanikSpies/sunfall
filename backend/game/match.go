package game

func (g *Game) enterPhaseLocked(next MatchPhase) {
	valid := false

	switch g.Phase {
	case PhaseSupernova:
		valid = next == PhaseBlackHole
	case PhaseBlackHole:
		valid = next == PhaseFinished
	case PhaseFinished:
		valid = next == PhaseSupernova
	}

	if !valid {
		panic("invalid match phase transition")
	}

	g.Phase = next
	g.PhaseElapsed = 0
}

func (g *Game) startMatchLocked() {
	g.enterPhaseLocked(PhaseSupernova)

	g.MatchTime = 0

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

		player.Alive = true

		player.QueueLifecyclePacket(buildMatchResetPacket())
	}
}

func (g *Game) finishMatchLocked() {
	for _, player := range g.Players {
		g.killPlayer(player, DeathByBlackHole)
	}

	g.enterPhaseLocked(PhaseFinished)
}

func (g *Game) alivePlayerCountLocked() int {
	aliveCount := 0

	for _, player := range g.Players {
		if player.Alive {
			aliveCount++
		}
	}

	return aliveCount
}

func (g *Game) killPlayer(player *Player, reason DeathReason) {
	if !player.Alive {
		return
	}

	player.Alive = false

	player.QueueLifecyclePacket(buildDeathPacket(reason))
}
