package game

import "math"

func (g *Game) Update(dt float64) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.Phase == PhaseFinished {
		g.FinishedTime += float32(dt)

		if g.FinishedTime >= 5 {
			g.ResetMatch()
		}

		return
	}

	g.MatchTime += float32(dt)
	progress := g.MatchTime / MatchDuration

	if progress > 1 {
		progress = 1
	}

	if g.Phase == PhaseSupernova && g.MatchTime >= MatchDuration {
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

			if inputX != 0 || inputY != 0 {
				player.Rotation = float32(math.Atan2(inputY, inputX))
			}
		}

		// calculate energy gain/loss based on distance to sun
		distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))
		factor := (NeutralEnergyDistance - distance) / NeutralEnergyDistance
		energyGain := factor * MaxEnergyGain

		player.Energy += energyGain * float32(dt)

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
		g.FinishedTime = 0
		return
	}
}
