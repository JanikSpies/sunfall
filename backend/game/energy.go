package game

func (g *Game) updatePlayerEnergyLocked(
	player *Player,
	distance float32,
	elapsed float32,
) bool {
	distanceFromSun := distance - g.Sun.Radius - player.Radius

	// Fixed-width energy band measured from the sun's surface: gain up to
	// NeutralEnergyDistance out, break even there, then lose more the further
	// past it you are. The band tracks the surface as the sun grows but no
	// longer widens with it (previously scaled by Sun.Scale, which ballooned
	// the gain zone up to 6x and meant players almost never lost energy).
	neutralEnergyDistance := NeutralEnergyDistance
	factor := (neutralEnergyDistance - distanceFromSun) / neutralEnergyDistance
	if factor > 1 {
		factor = 1
	} else if factor < -1 {
		factor = -1
	}
	energyChange := factor * MaxEnergyGain * elapsed
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