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

	// How fast the two are closing along the collision normal, using each
	// player's full velocity (movement input + knockback). A committed dash
	// carries a large closing speed here; two players drifting together carry
	// almost none. baseBounce is the floor so gentle bumps still separate.
	const baseBounce float32 = 300
	const bounceTransfer float32 = 0.6

	aVX := a.VX + a.KnockbackX
	aVY := a.VY + a.KnockbackY
	bVX := b.VX + b.KnockbackX
	bVY := b.VY + b.KnockbackY

	approach := (aVX-bVX)*nx + (aVY-bVY)*ny
	if approach < 0 {
		approach = 0
	}

	bounce := baseBounce + approach*bounceTransfer

	// Split by size: lighter (smaller) players get thrown further, so slamming
	// a small enemy launches them hard, while ramming a big one barely moves it.
	aForce := bounce * (b.Radius / totalRadius)
	bForce := bounce * (a.Radius / totalRadius)

	a.KnockbackX -= nx * aForce
	a.KnockbackY -= ny * aForce
	b.KnockbackX += nx * bForce
	b.KnockbackY += ny * bForce
}