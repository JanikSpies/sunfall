package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"strings"
	"sunfall/game"
	"time"

	"github.com/coder/websocket"
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

	ticker := time.NewTicker(time.Second / 30)
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

	player := game.Player{
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

	if !world.AddPlayer(&player) {
		conn.Close(websocket.StatusTryAgainLater, "server full")
		return
	}

	defer func() {
		if world.RemovePlayer(player.ID) {
			log.Println("Player disconnected:", player.ID)
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
