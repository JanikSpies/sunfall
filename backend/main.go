package main

import (
	"context"
	"log"
	"math/rand"
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

	player := Player{
		ID:   game.NextPlayerID(),
		X:    rand.Float64()*1000 - 500,
		Y:    rand.Float64()*1000 - 500,
		Conn: conn,
		Send: make(chan []byte, 32),
	}

	game.mu.Lock()
	game.Players[player.ID] = &player
	game.mu.Unlock()

	defer func() {
		game.mu.Lock()
		delete(game.Players, player.ID)
		game.mu.Unlock()

		close(player.Send)

		log.Println("Player disconnected:", player.ID)
	}()

	log.Println("Player connected:", player.ID)

	go player.writeLoop()

	player.Send <- buildConnectedPacket(&player)

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

			inputX := int8(data[1])
			inputY := int8(data[2])

			game.mu.Lock()
			player.InputX = inputX
			player.InputY = inputY
			game.mu.Unlock()
		}
	}
}
