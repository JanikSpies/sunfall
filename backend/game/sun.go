package game

type Sun struct {
	Radius             float32
	Scale              float32
	StartRadius        float32
	BlackHoleEndRadius float32
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
		s.calc(progress, s.StartRadius, SunGrowthRate)

	case PhaseBlackHole:
		if phaseElapsed <= BlackHoleCollapseDuration {
			progress := phaseElapsed / BlackHoleCollapseDuration

			s.calc(progress, s.BlackHoleEndRadius, BlackHoleShrinkRate)
			return
		}

		growthElapsed := phaseElapsed - BlackHoleCollapseDuration
		s.calc(growthElapsed, s.BlackHoleEndRadius, BlackHoleShrinkRate)
		if s.Radius < s.BlackHoleEndRadius {
			s.Radius = s.BlackHoleEndRadius
		}
	}
}
