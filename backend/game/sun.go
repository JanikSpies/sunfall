package game

type Sun struct {
	Radius      float32
	StartRadius float32
	EndRadius   float32

	BlackHoleStartRadius float32
	BlackHoleMaxRadius   float32
}

func (s *Sun) update(phase MatchPhase, phaseElapsed float32) {
	switch phase {
	case PhaseSupernova:
		progress := phaseElapsed / MatchDuration
		if progress > 1 {
			progress = 1
		}

		s.Radius = s.StartRadius + (s.EndRadius-s.StartRadius)*progress

	case PhaseBlackHole:
		if phaseElapsed <= BlackHoleCollapseDuration {
			progress := phaseElapsed / BlackHoleCollapseDuration
			s.Radius = s.EndRadius + (s.BlackHoleStartRadius-s.EndRadius)*progress
			return
		}

		growthElapsed := phaseElapsed - BlackHoleCollapseDuration
		s.Radius = s.BlackHoleStartRadius + BlackHoleGrowthPerSecond*growthElapsed
		if s.Radius > s.BlackHoleMaxRadius {
			s.Radius = s.BlackHoleMaxRadius
		}
	}
}
