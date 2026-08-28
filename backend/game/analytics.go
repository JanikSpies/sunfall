package game

import "time"

// Analytics events are fire-and-forget: the game package only ever offers
// them to a buffered channel with a non-blocking send (see emitAnalytics). If
// nobody is listening, or the listener falls behind, events are dropped
// rather than ever stalling the tick loop.

type SessionStartEvent struct {
	PlayerID uint16
	Name     string
	ClientID string
	At       time.Time
}

type SessionEndEvent struct {
	PlayerID uint16
	At       time.Time
}

type DeathAnalyticsEvent struct {
	VictimID          uint16
	VictimName        string
	Reason            DeathReason
	KillerID          *uint16
	KillerName        string
	EnergyTransferred float32
	PeakEnergy        float32
	At                time.Time
}

type ConcurrentPlayersEvent struct {
	Count int
	At    time.Time
}

// SetAnalyticsChannel wires up where analytics events get sent. Passing nil
// (the zero value) disables analytics entirely -- emitAnalytics becomes a
// no-op -- which is the default, so the game server never requires Postgres
// to be reachable to run.
func (g *Game) SetAnalyticsChannel(ch chan<- any) {
	g.analytics = ch
}

func (g *Game) emitAnalytics(event any) {
	if g.analytics == nil {
		return
	}

	select {
	case g.analytics <- event:
	default:
		// Channel's full -- a Postgres hiccup or a burst (e.g. everyone dying
		// at once at match end) shouldn't ever make the caller wait.
	}
}
