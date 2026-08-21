package main

import "sync"

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

func (g *Game) Update() {
	g.mu.Lock()
	defer g.mu.Unlock()

	for _, player := range g.Players {
		player.X += float64(player.InputX) * 0.01
		player.Y += float64(player.InputY) * 0.01
	}
}
