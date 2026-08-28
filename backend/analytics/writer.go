// Package analytics turns the game package's fire-and-forget event stream
// into rows in Postgres, for the Django admin panel / Grafana dashboards to
// read. It runs entirely on its own goroutine: nothing here ever runs on the
// tick loop, and a slow or unreachable database only ever delays or drops
// analytics, never gameplay.
package analytics

import (
	"context"
	"log"

	"sunfall/game"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Writer struct {
	pool   *pgxpool.Pool
	events <-chan any

	// sessionIDs maps the in-memory game player ID to the Postgres primary
	// key of its open stats_playersession row, so later events (kills,
	// deaths, disconnects) for the same connection can be linked to it. Only
	// ever touched from Run's single goroutine, so it needs no locking.
	sessionIDs map[uint16]int64
}

func NewWriter(pool *pgxpool.Pool, events <-chan any) *Writer {
	return &Writer{
		pool:       pool,
		events:     events,
		sessionIDs: make(map[uint16]int64),
	}
}

// Run drains the event channel and writes to Postgres until ctx is cancelled
// or the channel is closed. Call it with `go`.
func (w *Writer) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case event, open := <-w.events:
			if !open {
				return
			}
			w.handle(ctx, event)
		}
	}
}

func (w *Writer) handle(ctx context.Context, event any) {
	var err error

	switch e := event.(type) {
	case game.SessionStartEvent:
		err = w.handleSessionStart(ctx, e)
	case game.SessionEndEvent:
		err = w.handleSessionEnd(ctx, e)
	case game.DeathAnalyticsEvent:
		err = w.handleDeath(ctx, e)
	case game.ConcurrentPlayersEvent:
		err = w.handleConcurrentPlayers(ctx, e)
	default:
		log.Printf("analytics: unhandled event type %T", event)
	}

	if err != nil {
		log.Printf("analytics: failed to write %T: %v", event, err)
	}
}

func (w *Writer) handleSessionStart(ctx context.Context, e game.SessionStartEvent) error {
	var id int64

	err := w.pool.QueryRow(ctx,
		`INSERT INTO stats_playersession (player_id, name, client_id, connected_at, peak_energy)
		 VALUES ($1, $2, $3, $4, 0)
		 RETURNING id`,
		e.PlayerID, e.Name, nullableString(e.ClientID), e.At,
	).Scan(&id)
	if err != nil {
		return err
	}

	w.sessionIDs[e.PlayerID] = id

	return nil
}

func (w *Writer) handleSessionEnd(ctx context.Context, e game.SessionEndEvent) error {
	id, ok := w.sessionIDs[e.PlayerID]
	if !ok {
		// Never saw the matching start (e.g. the writer/DB came up mid-session) --
		// nothing to close.
		return nil
	}

	delete(w.sessionIDs, e.PlayerID)

	_, err := w.pool.Exec(ctx,
		`UPDATE stats_playersession SET disconnected_at = $1 WHERE id = $2`,
		e.At, id,
	)

	return err
}

func (w *Writer) handleDeath(ctx context.Context, e game.DeathAnalyticsEvent) error {
	victimSessionID, ok := w.sessionIDs[e.VictimID]
	if !ok {
		return nil
	}

	var killerSessionID *int64
	if e.KillerID != nil {
		if id, ok := w.sessionIDs[*e.KillerID]; ok {
			killerSessionID = &id
		}
	}

	_, err := w.pool.Exec(ctx,
		`INSERT INTO stats_deathevent
		   (victim_session_id, victim_name, reason, killer_session_id, killer_name, energy_transferred, occurred_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		victimSessionID, e.VictimName, reasonLabel(e.Reason), killerSessionID, nullableString(e.KillerName), e.EnergyTransferred, e.At,
	)
	if err != nil {
		return err
	}

	_, err = w.pool.Exec(ctx,
		`UPDATE stats_playersession SET peak_energy = GREATEST(peak_energy, $1) WHERE id = $2`,
		e.PeakEnergy, victimSessionID,
	)

	return err
}

func (w *Writer) handleConcurrentPlayers(ctx context.Context, e game.ConcurrentPlayersEvent) error {
	_, err := w.pool.Exec(ctx,
		`INSERT INTO stats_concurrentplayersample (count, sampled_at) VALUES ($1, $2)`,
		e.Count, e.At,
	)

	return err
}

func reasonLabel(reason game.DeathReason) string {
	switch reason {
	case game.DeathBySun:
		return "sun"
	case game.DeathByBlackHole:
		return "black_hole"
	case game.DeathByEnergyDepletion:
		return "energy_depletion"
	default:
		return "unknown"
	}
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
