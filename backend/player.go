package main

import "github.com/coder/websocket"

type Player struct {
	ID uint32

	X float64
	Y float64

	InputX int8
	InputY int8

	Conn *websocket.Conn
}
