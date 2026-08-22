package main

import (
	"context"
	"log"
	"net/http"
	"sunfall/game"
	"time"

	"github.com/coder/websocket"
)

var world = game.NewGame()

func main() {
	ticker := time.NewTicker(time.Second / 30)
	go func() {
		last := time.Now()

		for now := range ticker.C {
			dt := now.Sub(last).Seconds()
			last = now

			world.Update(dt)
			world.BroadcastWorldState()
		}
	}()

	radarTicker := time.NewTicker(time.Second)
	go func() {
		for range radarTicker.C {
			world.BroadcastRadar()
		}
	}()

	matchStateTicker := time.NewTicker(time.Second)
	go func() {
		for range matchStateTicker.C {
			world.BroadcastMatchState()
		}
	}()

	pingTimeoutTicker := time.NewTicker(5 * time.Second)
	go func() {
		for range pingTimeoutTicker.C {
			world.RemoveTimedOutPlayers()
		}
	}()

	http.HandleFunc("/ws", handleWebSocket)

	log.Println("Server running on :8080")

	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	opts := &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	}

	conn, err := websocket.Accept(w, r, opts)
	if err != nil {
		log.Println("WebSocket error:", err)
		return
	}
	defer conn.CloseNow()

	player := game.Player{
		Energy:    100,
		SizeLevel: 1,
		Radius:    16,
		Alive:     true,
		Conn:      conn,
		Send:      make(chan []byte, 32),
		Done:      make(chan struct{}),
		LastPing:  time.Now(),
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

	player.Send <- game.BuildConnectedPacket(&player)
	player.Send <- world.BuildMatchStatePacket()

	matchState := world.BuildMatchStatePacket()
	player.Send <- matchState
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
		case game.PacketInput:
			if len(data) != 4 {
				continue
			}

			inputX := int8(data[1])
			inputY := int8(data[2])

			if inputX == -128 {
				inputX = -127
			}

			if inputY == -128 {
				inputY = -127
			}

			if data[3] > 1 {
				continue
			}

			dash := data[3] == 1

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
