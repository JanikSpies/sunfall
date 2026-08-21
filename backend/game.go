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
