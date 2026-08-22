package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/coder/websocket"
)

var game = NewGame()

func main() {
	ticker := time.NewTicker(time.Second / 30)
	go func() {
		last := time.Now()

		for now := range ticker.C {
			dt := now.Sub(last).Seconds()
			last = now

			game.Update(dt)
			game.BroadcastWorldState()
		}
	}()

	radarTicker := time.NewTicker(time.Second)
	go func() {
		for range radarTicker.C {
			game.BroadcastRadar()
		}
	}()

	matchStateTicker := time.NewTicker(time.Second)
	go func() {
		for range matchStateTicker.C {
			game.BroadcastMatchState()
		}
	}()

	http.HandleFunc("/ws", handleWebSocket)

	log.Println("Server running on :8080")

	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		log.Println("WebSocket error:", err)
		return
	}
	defer conn.CloseNow()

	game.mu.RLock()
	full := len(game.Players) >= MaxPlayers
	game.mu.RUnlock()

	if full {
		conn.Close(websocket.StatusTryAgainLater, "server full")
		return
	}

	spawnX, spawnY := game.RandomSpawnPosition()
	player := Player{
		ID:        game.NextPlayerID(),
		X:         spawnX,
		Y:         spawnY,
		Alive:     true,
		Energy:    100,
		Radius:    16,
		SizeLevel: 1,
		Conn:      conn,
		Send:      make(chan []byte, 32),

		Done: make(chan struct{}),
	}

	game.mu.Lock()
	game.Players[player.ID] = &player
	game.mu.Unlock()

	defer func() {
		game.RemovePlayer(player.ID)
		close(player.Done)

		log.Println("Player disconnected:", player.ID)
	}()

	log.Println("Player connected:", player.ID)

	go player.writeLoop()

	player.Send <- buildConnectedPacket(&player)

	game.mu.RLock()
	matchState := buildMatchStatePacket(game)
	game.mu.RUnlock()

	player.Send <- matchState

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
		case PacketInput:
			if len(data) != 3 {
				continue
			}

			game.mu.Lock()

			if !player.Alive {
				game.mu.Unlock()
				continue
			}

			player.InputX = int8(data[1])
			player.InputY = int8(data[2])

			game.mu.Unlock()
		case PacketPing:
			select {
			case player.Send <- []byte{PacketPong}:
			default:
			}
		}
	}
}
