package game

func (g *Game) updatePlayerEnergyLocked(
	player *Player,
	distance float32,
	elapsed float32,
) bool {
	distanceFromSun := distance - g.Sun.Radius - player.Radius

	// Fixed-width band from the sun's surface. factor is +1 at the surface and
	// falls to 0 at NeutralEnergyDistance (the break-even edge).
	neutralEnergyDistance := NeutralEnergyDistance
	factor := (neutralEnergyDistance - distanceFromSun) / neutralEnergyDistance

	var energyChange float32
	if factor >= 0 {
		// Gain zone: linear, capped at the surface rate.
		if factor > 1 {
			factor = 1
		}
		energyChange = factor * MaxEnergyGain * elapsed
	} else {
		// Loss zone: drain accelerates the further out you stray. overshoot is
		// how many neutral-widths past the edge you are; the quadratic term
		// means straying far empties you fast instead of a flat trickle, so the
		// map's far reaches are unsurvivable.
		overshoot := -factor
		drainRate := EnergyDrainBaseRate * overshoot * (1 + overshoot*EnergyDrainAcceleration)
		energyChange = -drainRate * elapsed
	}

	previousEnergy := player.Energy
	player.Energy += energyChange

	if player.Energy > 0 {
		player.EnergyDepletedFor = 0
		return true
	}

	player.Energy = 0
	depletedFor := elapsed

	if previousEnergy > 0 && energyChange < 0 {
		timeToZeroFraction := previousEnergy / -energyChange
		if timeToZeroFraction < 1 {
			depletedFor = elapsed * (1 - timeToZeroFraction)
		} else {
			depletedFor = 0
		}
	}

	player.EnergyDepletedFor += depletedFor
	if player.EnergyDepletedFor >= EnergyDepletionGracePeriod {
		g.killPlayer(player, DeathByEnergyDepletion)
		return false
	}

	return true
}