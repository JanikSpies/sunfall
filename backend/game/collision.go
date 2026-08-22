package game

import "math"

func (g *Game) handlePlayerCollisions() {
	g.collisionGrid.Rebuild(g.Players)
	g.collisionGrid.ForEachCandidate(resolvePlayerCollision)
}

func resolvePlayerCollision(a, b *Player) {
	if !a.Alive || !b.Alive {
		return
	}

	dx := b.X - a.X
	dy := b.Y - a.Y
	minDistance := a.Radius + b.Radius
	distanceSquared := dx*dx + dy*dy

	if distanceSquared >= minDistance*minDistance {
		return
	}

	var nx, ny, distance float32

	if distanceSquared == 0 {
		if a.ID < b.ID {
			nx = 1
		} else {
			nx = -1
		}
	} else {
		distance = float32(math.Sqrt(float64(distanceSquared)))
		nx = dx / distance
		ny = dy / distance
	}

	overlap := minDistance - distance
	totalRadius := a.Radius + b.Radius
	aPush := overlap * (b.Radius / totalRadius)
	bPush := overlap * (a.Radius / totalRadius)

	a.X -= nx * aPush
	a.Y -= ny * aPush
	b.X += nx * bPush
	b.Y += ny * bPush

	const baseBounce float32 = 250
	aForce := baseBounce * (b.Radius / totalRadius)
	bForce := baseBounce * (a.Radius / totalRadius)

	a.KnockbackX -= nx * aForce
	a.KnockbackY -= ny * aForce
	b.KnockbackX += nx * bForce
	b.KnockbackY += ny * bForce
}
