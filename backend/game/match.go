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

	g.Sun.Radius = SunStartRadius

	for _, player := range g.Players {
		player.Alive = false
	}

	occupied := NewCollisionGrid()

	for _, player := range g.Players {
		spawnX, spawnY := g.randomSpawnPositionLocked(occupied)

		player.X = spawnX
		player.Y = spawnY
		player.Rotation = randomSpawnRotation()

		player.VX = 0
		player.VY = 0
		player.KnockbackX = 0
		player.KnockbackY = 0

		player.InputX = 0
		player.InputY = 0

		player.Energy = 100
		player.EnergyDepletedFor = 0
		player.SizeLevel = 1
		player.Radius = 16

		player.DashRequested = false
		player.DashCooldown = 0

		player.LastHitBy = 0
		player.LastHitTimer = 0

		player.Alive = true

		occupied.Insert(player)

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

	g.creditKillLocked(player, reason)

	delete(g.Players, player.ID)

	player.QueueLifecyclePacket(buildDeathPacket(reason))
}

// creditKillLocked transfers a share of the victim's energy to whoever knocked
// them in, if that hit is still within the credit window. Only sun deaths are
// attributed: energy depletion is self-inflicted, and black-hole deaths at the
// match finish are a mass event, not a kill.
func (g *Game) creditKillLocked(victim *Player, reason DeathReason) {
	if reason != DeathBySun {
		return
	}

	if victim.LastHitTimer <= 0 || victim.LastHitBy == 0 {
		return
	}

	killer, ok := g.Players[victim.LastHitBy]
	if !ok || killer == victim {
		return
	}

	reward := victim.Energy * KillEnergyReward
	if reward <= 0 {
		return
	}

	killer.Energy += reward

	select {
	case killer.Send <- buildKillPacket(victim.ID, victim.Name, reward, victim.X, victim.Y):
	default:
	}
}