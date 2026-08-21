package main

import (
	"encoding/binary"
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

func (g *Game) BuildWorldState() []byte {
	g.mu.RLock()
	defer g.mu.RUnlock()

	playerCount := len(g.Players)

	buf := make([]byte, 3+(playerCount*20))

	buf[0] = PacketWorldState
	binary.BigEndian.PutUint16(buf[1:3], uint16(playerCount))

	offset := 3

	for _, player := range g.Players {
		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			player.ID,
		)
		offset += 4

		binary.BigEndian.PutUint64(
			buf[offset:offset+8],
			math.Float64bits(player.X),
		)
		offset += 8

		binary.BigEndian.PutUint64(
			buf[offset:offset+8],
			math.Float64bits(player.Y),
		)
		offset += 8
	}

	return buf
}
