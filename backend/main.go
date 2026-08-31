package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"strings"
	"sunfall/analytics"
	"sunfall/game"
	"time"

	"github.com/coder/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	world            = game.NewGame()
	websocketOptions websocket.AcceptOptions
)

func main() {
	originPatterns, err := parseOriginPatterns(os.Getenv("WS_ALLOWED_ORIGINS"))
	if err != nil {
		log.Fatal(err)
	}
	websocketOptions.OriginPatterns = originPatterns

	setupAnalytics()

	ticker := time.NewTicker(time.Second / 60)
	go func() {
		last := time.Now()

		for now := range ticker.C {
			func() {
				defer recoverAndLog("tick loop")

				dt := now.Sub(last).Seconds()
				last = now

				world.Update(dt)
				world.BroadcastWorldState()
			}()
		}
	}()

	matchStateTicker := time.NewTicker(time.Second / 10)
	go func() {
		for range matchStateTicker.C {
			func() {
				defer recoverAndLog("match state ticker")

				world.BroadcastMatchState()
			}()
		}
	}()

	scoreboardTicker := time.NewTicker(time.Second / 2)
	go func() {
		for range scoreboardTicker.C {
			func() {
				defer recoverAndLog("scoreboard ticker")

				world.BroadcastScoreboard()
			}()
		}
	}()

	pingTimeoutTicker := time.NewTicker(5 * time.Second)
	go func() {
		for range pingTimeoutTicker.C {
			func() {
				defer recoverAndLog("ping timeout ticker")

				world.RemoveTimedOutPlayers()
			}()
		}
	}()

	concurrentPlayersTicker := time.NewTicker(30 * time.Second)
	go func() {
		// -1 so the very first sample (even 0) always writes, giving the
		// graph a defined starting point.
		lastCount := -1

		for now := range concurrentPlayersTicker.C {
			func() {
				defer recoverAndLog("concurrent players ticker")

				count := world.PlayerCount()
				// Only write on an actual change (including the transition
				// into/out of empty), not every 30s regardless -- an idle
				// server would otherwise fill the table with identical rows
				// forever. This is also more accurate than only skipping
				// zeros would be: a real transition still gets recorded, so
				// the graph drops to zero exactly when it should instead of
				// drawing a misleading sloped line across the gap.
				if count == lastCount {
					return
				}
				lastCount = count

				emitAnalytics(game.ConcurrentPlayersEvent{
					Count: count,
					At:    now,
				})
			}()
		}
	}()

	http.HandleFunc("/ws", handleWebSocket)

	log.Println("Server running on :8080")

	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocketOptions)
	if err != nil {
		log.Println("WebSocket error:", err)
		return
	}
	defer conn.CloseNow()

	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		name = "Player"
	}
	runes := []rune(name)
	if len(runes) > 16 {
		name = string(runes[:16])
	}

	session := strings.TrimSpace(r.URL.Query().Get("session"))
	clientID := strings.TrimSpace(r.URL.Query().Get("client_id"))
	isBot := r.URL.Query().Get("bot") == "1"

	player := game.Player{
		Name:       name,
		SessionID:  session,
		ClientID:   clientID,
		IsBot:      isBot,
		Energy:     100,
		SizeLevel:  1,
		Radius:     16,
		Alive:      true,
		Conn:       conn,
		Send:       make(chan []byte, 32),
		WorldState: make(chan []byte, 1),
		Lifecycle:  make(chan []byte, 4),
		Disconnect: make(chan struct{}),
		Done:       make(chan struct{}),
		LastPing:   time.Now(),
	}

	ok, resumed := world.AddPlayer(&player)
	if !ok {
		conn.Close(websocket.StatusTryAgainLater, "server full")
		return
	}

	// A resumed connection (see AddPlayer) picks up an existing player
	// identity after a brief reconnect -- it isn't a new analytics session.
	// Bots (see Player.IsBot) never get a session event either way: running
	// with or without them connected must look identical in analytics.
	if !resumed && !player.IsBot {
		emitAnalytics(game.SessionStartEvent{
			PlayerID: player.ID,
			Name:     player.Name,
			ClientID: player.ClientID,
			At:       time.Now(),
		})
	}

	defer func() {
		if world.RemovePlayer(&player) {
			log.Println("Player disconnected:", player.ID)
			if !player.IsBot {
				emitAnalytics(game.SessionEndEvent{
					PlayerID: player.ID,
					At:       time.Now(),
				})
			}
		}
		player.CloseDone()
	}()

	go player.WriteLoop()

	player.QueueLifecyclePacket(world.BuildConnectedPacket(&player))
	player.QueueLifecyclePacket(world.BuildMatchStatePacket())

	for {
		messageType, data, err := conn.Read(context.Background())
		if err != nil {
			return
		}

		if messageType != websocket.MessageBinary {
			continue
		}

		if len(data) < 1 {
			continue
		}

		switch data[0] {
		case game.PacketInput:
			inputX, inputY, dash, ok := game.ParseInputPacket(data)
			if !ok {
				continue
			}

			world.SetPlayerInput(
				&player,
				inputX,
				inputY,
				dash,
			)
		case game.PacketPing:
			if len(data) != 1 {
				continue
			}

			player.MarkPing()

			select {
			case player.Send <- []byte{game.PacketPong}:
			default:
			}
		}
	}
}

// analyticsChan is nil unless DATABASE_URL is set -- analytics is an optional
// side-channel the game server never depends on to run.
var analyticsChan chan any

// setupAnalytics wires the game package's event stream to a Postgres writer
// running on its own goroutine. If DATABASE_URL isn't set, or the database
// can't be reached, analytics is simply skipped -- it never blocks startup
// or the tick loop.
func setupAnalytics() {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		log.Println("DATABASE_URL not set, analytics disabled")
		return
	}

	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Printf("analytics: failed to configure database pool, analytics disabled: %v", err)
		return
	}

	// Buffered generously: a match-end mass death (everyone dies at once) can
	// briefly burst far more events than steady-state, and the send from the
	// game loop must never block waiting for room.
	analyticsChan = make(chan any, 4096)

	writer := analytics.NewWriter(pool, analyticsChan)
	go writer.Run(context.Background())

	world.SetAnalyticsChannel(analyticsChan)

	log.Println("Analytics enabled")
}

func emitAnalytics(event any) {
	if analyticsChan == nil {
		return
	}

	select {
	case analyticsChan <- event:
	default:
	}
}

func recoverAndLog(context string) {
	if r := recover(); r != nil {
		log.Printf("recovered panic in %s: %v", context, r)
	}
}

func parseOriginPatterns(rawOrigins string) ([]string, error) {
	var patterns []string

	for rawPattern := range strings.SplitSeq(rawOrigins, ",") {
		pattern := strings.TrimSpace(rawPattern)
		if pattern == "" {
			continue
		}

		if pattern == "*" {
			return nil, fmt.Errorf("WS_ALLOWED_ORIGINS must not contain an unrestricted wildcard")
		}

		if _, err := path.Match(pattern, pattern); err != nil {
			return nil, fmt.Errorf("invalid WS_ALLOWED_ORIGINS pattern %q: %w", pattern, err)
		}

		patterns = append(patterns, pattern)
	}

	return patterns, nil
}
