package main

import (
	"context"
	"time"

	"github.com/coder/websocket"
)

type Player struct {
	ID uint32

	X float64
	Y float64

	InputX int8
	InputY int8

	Conn *websocket.Conn

	Send chan []byte
}

func writeLoop(player *Player) {
	for data := range player.Send {
		ctx, cancel := context.WithTimeout(
			context.Background(),
			100*time.Millisecond,
		)

		err := player.Conn.Write(
			ctx,
			websocket.MessageBinary,
			data,
		)

		cancel()

		if err != nil {
			return
		}
	}
}
