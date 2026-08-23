package game

type Sun struct {
	Radius float32
	Scale  float32
}

func (s *Sun) calc(progress float32, startRadius float32, shrinkRate float32) {
	newRadius := s.Radius + shrinkRate*progress
	s.Scale = newRadius / startRadius
	s.Radius = newRadius
}

func (s *Sun) update(phase MatchPhase, phaseElapsed float32) {
	switch phase {
	case PhaseSupernova:
		progress := phaseElapsed / MatchDuration
		if progress > 1 {
			progress = 1
		}
		s.calc(progress, SunStartRadius, SunGrowthRate)

	case PhaseBlackHole:
		if phaseElapsed <= BlackHoleCollapseDuration {
			progress := phaseElapsed / BlackHoleCollapseDuration

			s.calc(progress, BlackHoleEndRadius, BlackHoleShrinkRate)
			return
		}

		growthElapsed := phaseElapsed - BlackHoleCollapseDuration
		s.calc(growthElapsed, BlackHoleEndRadius, BlackHoleShrinkRate)
		if s.Radius < BlackHoleEndRadius {
			s.Radius = BlackHoleEndRadius
		}
	}
}
