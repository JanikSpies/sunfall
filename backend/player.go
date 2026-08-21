package main

import (
	"context"
	"time"

	"github.com/coder/websocket"
)

type Player struct {
	ID uint32

	X float32
	Y float32

	VX float32
	VY float32

	KnockbackX float32
	KnockbackY float32

	InputX int8
	InputY int8

	Alive     bool
	Energy    float32
	Radius    float32
	SizeLevel uint8

	Conn *websocket.Conn
	Send chan []byte
}

func (p *Player) writeLoop() {
	for data := range p.Send {
		ctx, cancel := context.WithTimeout(
			context.Background(),
			100*time.Millisecond,
		)

		err := p.Conn.Write(
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
