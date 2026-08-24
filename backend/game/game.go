package game

import (
	"sync"
	"time"
)

type MatchPhase uint8

const (
	MaxPlayers  = 1000
	PingTimeout = 5 * time.Second

	PlayerSpeed             = 200.0
	MaxPlayerRadius float32 = 40
	MaxSpawnBuffer  float32 = 1000
	MinSpawnBuffer  float32 = 500

	CollisionCellSize   float32 = 160
	PlayerHitScale      float32 = 1.6
	VisibilityChunkSize float32 = 512
	VisibilityRadius    float32 = 1280

	SunStartRadius     float32 = 300
	BlackHoleEndRadius float32 = 150

	NeutralEnergyDistance      float32 = 750
	MaxEnergyGain              float32 = 20
	EnergyDrainBaseRate float32 = 15
	EnergyDepletionGracePeriod float32 = 5
	EnergyDrainAcceleration float32 = 1.0

	DashCooldownDuration float32 = 0.5
	DashEnergyCost       float32 = 50
	DashForce            float32 = 1200
	KnockbackDecay       float32 = 3

	KillEnergyReward  float32 = 0.5 // fraction of the victim's energy the killer absorbs
	KillCreditWindow  float32 = 2   // seconds a hit stays attributable to a kill
	HitSpeedThreshold float32 = 300 // min closing speed for a hit to count as a kill setup

	MatchDuration     float32 = 4 * 60
	FinishedDuration  float32 = 5
	BlackHoleDuration float32 = 20
	MaxTickElapsed    float32 = 0.1

	PhaseSupernova MatchPhase = 1
	PhaseBlackHole MatchPhase = 2
	PhaseFinished  MatchPhase = 3

	SupernovaGravityReach         float32 = 10000
	SupernovaGravityStrengthScale float32 = 0.1

	BlackHolePullStart        float32 = 3600
	BlackHolePullMax          float32 = 7200
	BlackHoleRampTime         float32 = 15
	BlackHoleCollapseDuration float32 = 3
)

type Game struct {
	mu sync.RWMutex

	Players      map[uint16]*Player
	nextPlayerID uint16

	Sun Sun

	Scoreboard []ScoreboardEntry

	MatchTime    float32
	PhaseElapsed float32
	Phase        MatchPhase

	collisionGrid *CollisionGrid
	snapshot      *VisibilitySnapshot
	tick          uint32
}

func NewGame() *Game {
	game := &Game{
		Players:       make(map[uint16]*Player),
		collisionGrid: NewCollisionGrid(),

		Sun: Sun{
			Radius: SunStartRadius,
			Scale:  1,
		},

		Phase: PhaseSupernova,
	}

	game.snapshot = newVisibilitySnapshot(0, game.Players)

	return game
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
