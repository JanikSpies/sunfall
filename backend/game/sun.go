package game

// SunEndRadius is the radius the sun reaches at the end of the supernova
// phase. Growth is a straight interpolation from SunStartRadius to this value
// over MatchDuration, so the edge advances at a constant, escapable speed:
//   (SunEndRadius - SunStartRadius) / MatchDuration = (1800-300)/240 = 6.25 u/s
// well under PlayerSpeed (200). Tune this to make the sun bigger/smaller; the
// growth stays predictable no matter what you pick.
const SunEndRadius float32 = 1800

type Sun struct {
	Radius float32
	Scale  float32
}

func (s *Sun) update(phase MatchPhase, phaseElapsed float32) {
	switch phase {
	case PhaseSupernova:
		progress := phaseElapsed / MatchDuration
		if progress > 1 {
			progress = 1
		}

		// Radius is computed directly from progress (not accumulated), so it
		// grows at a constant speed, lands exactly on SunEndRadius at match
		// end, and is independent of tick rate.
		s.Radius = SunStartRadius + (SunEndRadius-SunStartRadius)*progress

	case PhaseBlackHole:
		progress := phaseElapsed / BlackHoleCollapseDuration
		if progress > 1 {
			progress = 1
		}

		// Collapse from exactly where the supernova ended (SunEndRadius) down
		// to BlackHoleEndRadius over the collapse duration, then hold. Because
		// the black hole starts at SunEndRadius, the radius is continuous
		// across the phase change -- no jump.
		s.Radius = SunEndRadius + (BlackHoleEndRadius-SunEndRadius)*progress
	}

	// Scale always means the same thing -- radius relative to SunStartRadius --
	// in every phase. That keeps the value the client renders from continuous
	// across the supernova -> black hole handoff. (Previously the black hole
	// divided by BlackHoleEndRadius, which halved the reference and doubled
	// Scale at the transition, making the sprite jump.)
	s.Scale = s.Radius / SunStartRadius
}