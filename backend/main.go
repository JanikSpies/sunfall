package main

import (
	"context"
	"log"
	"net/http"

	"github.com/coder/websocket"
)

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

	log.Println("Player connected:")

	buf := make([]byte, 17)

	buf[0] = 1

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
