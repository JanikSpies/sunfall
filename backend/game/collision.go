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

	// baseBounce is the floor so gentle bumps still separate; the rest scales
	// with how fast the two are closing, so a committed dash launches the
	// target proportionally to the impact.
	const baseBounce float32 = 300
	const bounceTransfer float32 = 0.6

	aVX := a.VX + a.KnockbackX
	aVY := a.VY + a.KnockbackY
	bVX := b.VX + b.KnockbackX
	bVY := b.VY + b.KnockbackY

	// Closing speed along the normal, and how fast each player is driving into
	// the other. The faster driver is the aggressor and "owns" the hit.
	approach := (aVX-bVX)*nx + (aVY-bVY)*ny
	aIntoB := aVX*nx + aVY*ny
	bIntoA := -(bVX*nx + bVY*ny)

	// Only a genuine shove (dash-speed impact) tags a victim for kill credit;
	// passive drifting stays below the threshold and never attributes a kill.
	if approach > HitSpeedThreshold {
		if aIntoB >= bIntoA {
			b.LastHitBy = a.ID
			b.LastHitTimer = KillCreditWindow
		} else {
			a.LastHitBy = b.ID
			a.LastHitTimer = KillCreditWindow
		}
	}

	if approach < 0 {
		approach = 0
	}

	bounce := baseBounce + approach*bounceTransfer

	aForce := bounce * (b.Radius / totalRadius)
	bForce := bounce * (a.Radius / totalRadius)

	a.KnockbackX -= nx * aForce
	a.KnockbackY -= ny * aForce
	b.KnockbackX += nx * bForce
	b.KnockbackY += ny * bForce
}