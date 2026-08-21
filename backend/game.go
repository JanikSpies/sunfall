package main

import (
	"math"
	"sync"
)

const PlayerSpeed = 200.0

type Game struct {
	mu sync.RWMutex

	Players      map[uint32]*Player
	nextPlayerID uint32
}

func NewGame() *Game {
	return &Game{
		Players: make(map[uint32]*Player),
	}
}

func (g *Game) NextPlayerID() uint32 {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.nextPlayerID++

	return g.nextPlayerID
}

func (g *Game) Update(dt float64) {
	g.mu.Lock()
	defer g.mu.Unlock()

	for _, player := range g.Players {
		inputX := float64(player.InputX) / 127.0
		inputY := float64(player.InputY) / 127.0

		length := math.Hypot(inputX, inputY)

		if length > 1 {
			inputX /= length
			inputY /= length
		}

		player.X += inputX * PlayerSpeed * dt
		player.Y += inputY * PlayerSpeed * dt
	}
}
