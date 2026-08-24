package game

import "math"

func (g *Game) Update(dt float64) {
	g.mu.Lock()
	defer g.mu.Unlock()

	elapsed := float32(dt)
	if elapsed <= 0 {
		return
	}

	if elapsed > MaxTickElapsed {
		elapsed = MaxTickElapsed
	}

	defer g.publishVisibilitySnapshotLocked()
	defer g.updateScoreboardLocked()

	if g.Phase == PhaseFinished {
		g.PhaseElapsed += elapsed

		if g.PhaseElapsed >= FinishedDuration {
			g.startMatchLocked()
		}

		return
	}

	g.MatchTime += elapsed
	g.PhaseElapsed += elapsed

	switch g.Phase {
	case PhaseSupernova:
		g.Sun.update(g.Phase, g.PhaseElapsed)

		if g.PhaseElapsed >= MatchDuration {
			g.enterPhaseLocked(PhaseBlackHole)
		}

	case PhaseBlackHole:
		g.Sun.update(g.Phase, g.PhaseElapsed)
	}

	for _, player := range g.Players {
		if !player.Alive {
			continue
		}

		if player.LastHitTimer > 0 {
			player.LastHitTimer -= elapsed
			if player.LastHitTimer <= 0 {
				player.LastHitTimer = 0
				player.LastHitBy = 0
			}
		}

		g.updatePlayerMovement(player, elapsed)

		dx := -player.X
		dy := -player.Y

		distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))
		if !g.updatePlayerEnergyLocked(player, distance, elapsed) {
			continue
		}

		player.SizeLevel = sizeLevelForEnergy(player.Energy)
		player.Radius = radiusForSizeLevel(player.SizeLevel)

		if g.Phase == PhaseSupernova && distance <= g.Sun.Radius+player.Radius {
			g.killPlayer(player, DeathBySun)
			continue
		}
	}

	g.handlePlayerCollisions()

	if g.Phase == PhaseBlackHole &&
		(g.alivePlayerCountLocked() == 0 || g.PhaseElapsed >= BlackHoleDuration) {
		g.finishMatchLocked()
		return
	}
}

func (g *Game) updatePlayerMovement(player *Player, elapsed float32) {
	if player.DashCooldown > 0 {
		if player.Dashed {
			player.Dashed = false
		}

		player.DashCooldown -= elapsed

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
			player.Dashed = true
		}

		player.DashRequested = false
	}

	inputX := float64(player.InputX) / 127.0
	inputY := float64(player.InputY) / 127.0

	length := math.Hypot(inputX, inputY)

	if length > 0 {
		inputX /= length
		inputY /= length
	}

	if inputX != 0 || inputY != 0 {
		player.Rotation = float32(math.Atan2(inputY, inputX))
	}

	player.VX = float32(inputX * PlayerSpeed)
	player.VY = float32(inputY * PlayerSpeed)

	g.gravitationPull(player, elapsed)

	player.X += (player.VX + player.KnockbackX) * elapsed
	player.Y += (player.VY + player.KnockbackY) * elapsed

	player.KnockbackX -= player.KnockbackX * KnockbackDecay * elapsed
	player.KnockbackY -= player.KnockbackY * KnockbackDecay * elapsed
}

func (g *Game) gravitationPull(player *Player, elapsed float32) {
	dx := -player.X
	dy := -player.Y

	distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))

	if g.Phase == PhaseSupernova {
		if distance <= 0 {
			return
		}

		surfaceDistance := distance - g.Sun.Radius
		if surfaceDistance < 0 {
			surfaceDistance = 0
		}

		if surfaceDistance >= SupernovaGravityReach {
			return
		}

		nx := dx / distance
		ny := dy / distance

		falloff := (SupernovaGravityReach - surfaceDistance) / SupernovaGravityReach

		supernovaGravStrength := g.Sun.Radius * SupernovaGravityStrengthScale
		pullStrength := supernovaGravStrength * falloff

		player.KnockbackX += nx * pullStrength * elapsed
		player.KnockbackY += ny * pullStrength * elapsed

	}
	if g.Phase == PhaseBlackHole {
		if distance <= 0 {
			return
		}

		nx := dx / distance
		ny := dy / distance

		pullProgress := g.PhaseElapsed / BlackHoleRampTime
		if pullProgress > 1 {
			pullProgress = 1
		}

		pullStrength := BlackHolePullStart + (BlackHolePullMax-BlackHolePullStart)*pullProgress

		player.KnockbackX += nx * pullStrength * elapsed
		player.KnockbackY += ny * pullStrength * elapsed

		// die if you collide with black hole
		if distance <= g.Sun.Radius+player.Radius {
			g.killPlayer(player, DeathByBlackHole)
		}
	}
}

func (g *Game) publishVisibilitySnapshotLocked() {
	g.tick++
	g.snapshot = newVisibilitySnapshot(g.tick, g.Players)
}
