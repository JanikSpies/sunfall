package game

import (
	"sync"
	"time"
)

type MatchPhase uint8

const (
	MaxPlayers  = 1000
	PingTimeout = 15 * time.Second

	PlayerSpeed         = 200.0
	MapHalfSize float32 = 2000

	NeutralEnergyDistance         = 100
	MaxEnergyGain         float32 = 10

	DashCooldownDuration float32 = 0.75
	DashEnergyCost       float32 = 25
	DashForce            float32 = 700
	KnockbackDecay       float32 = 6

	MatchDuration  float32    = 10 * 60
	PhaseSupernova MatchPhase = 1
	PhaseBlackHole MatchPhase = 2
	PhaseFinished  MatchPhase = 3

	BlackHolePullStart       float32 = 1800
	BlackHolePullMax         float32 = 3600
	BlackHoleRampTime        float32 = 8
	BlackHoleGrowthPerSecond float32 = 60
)

type Game struct {
	mu sync.RWMutex

	Players      map[uint16]*Player
	nextPlayerID uint16

	Sun Sun

	FinishedTime float32
	MatchTime    float32
	Phase        MatchPhase
}

func NewGame() *Game {
	return &Game{
		Players: make(map[uint16]*Player),

		Sun: Sun{
			X:                  0,
			Y:                  0,
			Radius:             150,
			StartRadius:        150,
			EndRadius:          700,
			BlackHoleRadius:    80,
			BlackHoleMaxRadius: 500,
		},

		Phase: PhaseSupernova,
	}
}

func (g *Game) RemovePlayer(id uint16) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, exists := g.Players[id]; !exists {
		return false
	}

	delete(g.Players, id)

	return true
}
