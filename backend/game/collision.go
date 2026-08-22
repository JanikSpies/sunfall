package game

import "math"

func (g *Game) handlePlayerCollisions() {
	players := make([]*Player, 0, len(g.Players))

	for _, player := range g.Players {
		if player.Alive {
			players = append(players, player)
		}
	}

	for i := 0; i < len(players); i++ {
		for j := i + 1; j < len(players); j++ {
			a := players[i]
			b := players[j]

			if !a.Alive || !b.Alive {
				continue
			}

			dx := b.X - a.X
			dy := b.Y - a.Y

			distance := float32(math.Sqrt(float64(dx*dx + dy*dy)))
			minDistance := a.Radius + b.Radius

			if distance >= minDistance || distance == 0 {
				continue
			}

			nx := dx / distance
			ny := dy / distance

			overlap := minDistance - distance
			push := overlap / 2

			a.X -= nx * push
			a.Y -= ny * push

			b.X += nx * push
			b.Y += ny * push

			baseBounce := float32(250)

			totalRadius := a.Radius + b.Radius

			aForce := baseBounce * (b.Radius / totalRadius)
			bForce := baseBounce * (a.Radius / totalRadius)

			a.KnockbackX -= nx * aForce
			a.KnockbackY -= ny * aForce

			b.KnockbackX += nx * bForce
			b.KnockbackY += ny * bForce
		}
	}
}
