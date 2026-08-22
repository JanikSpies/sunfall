package game

func (g *Game) updatePlayerEnergyLocked(
	player *Player,
	distance float32,
	elapsed float32,
) bool {
	distanceFromSun := distance - g.Sun.Radius - player.Radius
	factor := (NeutralEnergyDistance - distanceFromSun) / NeutralEnergyDistance
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
