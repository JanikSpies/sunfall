package main

import (
	"context"
	"encoding/binary"
	"log"
	"math"
	"math/rand"
	"net/http"

	"github.com/coder/websocket"
)

var game = NewGame()

func main() {
	http.HandleFunc("/ws", handleWebSocket)

	log.Println("Server running on :8080")

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		log.Println("WebSocket error:", err)
		return
	}
	defer conn.CloseNow()

	player := Player{
		ID: game.NextPlayerID(),
		X:  rand.Float64()*1000 - 500,
		Y:  rand.Float64()*1000 - 500,
	}
	game.mu.Lock()
	game.Players[player.ID] = &player
	game.mu.Unlock()

	defer func() {
		game.mu.Lock()
		delete(game.Players, player.ID)
		game.mu.Unlock()

		log.Println("Player disconnected:", player.ID)
	}()

	log.Println("Player connected:", player.ID)

	buf := make([]byte, 21)

	buf[0] = 1

	binary.BigEndian.PutUint32(
		buf[1:5],
		player.ID,
	)

	binary.BigEndian.PutUint64(
		buf[5:13],
		math.Float64bits(player.X),
	)

	binary.BigEndian.PutUint64(
		buf[13:21],
		math.Float64bits(player.Y),
	)

	err = conn.Write(
		context.Background(),
		websocket.MessageBinary,
		buf,
	)
	if err != nil {
		log.Println("Write error:", err)
		return
	}

	for {
		_, message, err := conn.Read(context.Background())
		if err != nil {
			return
		}

		log.Println("Received:", string(message))
	}
}
