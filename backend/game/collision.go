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
	distanceSquared := dx*dx + dy*dy

	physical := a.Radius + b.Radius

	// Players connect within a hit range wider than their physical radius, so a
	// fast dash lands reliably instead of needing a near-perfect center-on-center
	// overlap. Bodies still only *separate* at the true radius (below).
	hitDistance := physical * PlayerHitScale

	if distanceSquared >= hitDistance*hitDistance {
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

	overlapping := distance < physical

	// Push apart only on real overlap -- keeps ships from floating apart across
	// the wider hit range.
	if overlapping {
		overlap := physical - distance
		a.X -= nx * overlap * (b.Radius / physical)
		a.Y -= ny * overlap * (b.Radius / physical)
		b.X += nx * overlap * (a.Radius / physical)
		b.Y += ny * overlap * (a.Radius / physical)
	}

	aVX := a.VX + a.KnockbackX
	aVY := a.VY + a.KnockbackY
	bVX := b.VX + b.KnockbackX
	bVY := b.VY + b.KnockbackY

	approach := (aVX-bVX)*nx + (aVY-bVY)*ny

	// Near each other but neither overlapping nor closing: just proximity, so
	// apply nothing. Lets players group up without repelling; only a genuine
	// impact (or a true overlap) transfers force.
	if approach <= 0 && !overlapping {
		return
	}

	aIntoB := aVX*nx + aVY*ny
	bIntoA := -(bVX*nx + bVY*ny)

	// Significant impact tags the player who got driven into, for kill credit.
	if approach > HitSpeedThreshold {
		if aIntoB >= bIntoA {
			b.LastHitBy = a.ID
			b.LastHitTimer = KillCreditWindow
		} else {
			a.LastHitBy = b.ID
			a.LastHitTimer = KillCreditWindow
		}
	}

	// baseBounce is a small floor to unstick overlapping bodies; the launch
	// comes from bounceTransfer scaling with how fast the attacker hit.
	const baseBounce float32 = 200
	const bounceTransfer float32 = 2.5

	var bounce float32
	if overlapping {
		bounce = baseBounce
	}
	if approach > 0 {
		bounce += approach * bounceTransfer
	}

	aForce := bounce * (b.Radius / physical)
	bForce := bounce * (a.Radius / physical)

	a.KnockbackX -= nx * aForce
	a.KnockbackY -= ny * aForce
	b.KnockbackX += nx * bForce
	b.KnockbackY += ny * bForce
}