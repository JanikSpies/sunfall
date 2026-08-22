package game

import (
	"encoding/binary"
	"math"
	"sort"
	"time"

	"github.com/coder/websocket"
)

func (g *Game) BuildConnectedPacket(player *Player) []byte {
	g.mu.RLock()
	defer g.mu.RUnlock()

	return buildConnectedPacket(player)
}

func (g *Game) BuildWorldState() []byte {
	g.mu.RLock()
	defer g.mu.RUnlock()

	playerCount := 0

	for _, player := range g.Players {
		if player.Alive {
			playerCount++
		}
	}

	buf := make([]byte, 3+(playerCount*20))

	buf[0] = PacketWorldState
	binary.BigEndian.PutUint16(buf[1:3], uint16(playerCount))

	offset := 3

	for _, player := range g.Players {
		if !player.Alive {
			continue
		}

		binary.BigEndian.PutUint16(
			buf[offset:offset+2],
			player.ID,
		)
		offset += 2

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.X),
		)
		offset += 4

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.Y),
		)
		offset += 4

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.Rotation),
		)
		offset += 4

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.Energy),
		)
		offset += 4

		buf[offset] = player.SizeLevel
		offset++

		dashAvailable := player.Alive &&
			player.DashCooldown <= 0 &&
			player.Energy >= DashEnergyCost

		if dashAvailable {
			buf[offset] = 1
		} else {
			buf[offset] = 0
		}
		offset++
	}

	return buf
}

func (g *Game) BroadcastWorldState() {
	data := g.BuildWorldState()

	g.mu.RLock()
	defer g.mu.RUnlock()

	for _, player := range g.Players {
		select {
		case player.Send <- data:
		default:
			// Player is too slow; skip this update.
		}
	}
}

func (g *Game) BuildRadarPacket() []byte {
	g.mu.RLock()
	defer g.mu.RUnlock()

	players := make([]*Player, 0, len(g.Players))

	for _, player := range g.Players {
		if player.Alive {
			players = append(players, player)
		}
	}

	sort.Slice(players, func(i, j int) bool {
		return players[i].Energy > players[j].Energy
	})

	if len(players) > 10 {
		players = players[:10]
	}

	buf := make([]byte, 2+(len(players)*10))

	buf[0] = PacketRadar
	buf[1] = byte(len(players))

	offset := 2

	for _, player := range players {
		binary.BigEndian.PutUint16(
			buf[offset:offset+2],
			player.ID,
		)
		offset += 2

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.X),
		)
		offset += 4

		binary.BigEndian.PutUint32(
			buf[offset:offset+4],
			math.Float32bits(player.Y),
		)
		offset += 4
	}

	return buf
}

func (g *Game) BroadcastRadar() {
	data := g.BuildRadarPacket()

	g.mu.RLock()
	defer g.mu.RUnlock()

	for _, player := range g.Players {
		select {
		case player.Send <- data:
		default:
			// Slow client: skip this radar update.
		}
	}
}

func (g *Game) BroadcastMatchState() {
	g.mu.RLock()
	data := buildMatchStatePacket(g)

	players := make([]*Player, 0, len(g.Players))
	for _, player := range g.Players {
		players = append(players, player)
	}
	g.mu.RUnlock()

	for _, player := range players {
		select {
		case player.Send <- data:
		default:
		}
	}
}

func (g *Game) RemoveTimedOutPlayers() {
	now := time.Now()

	var timedOut []*Player

	g.mu.Lock()

	for id, player := range g.Players {
		if now.Sub(player.LastPingTime()) > PingTimeout {
			delete(g.Players, id)
			timedOut = append(timedOut, player)
		}
	}

	g.mu.Unlock()

	for _, player := range timedOut {
		player.CloseDone()

		player.Conn.Close(
			websocket.StatusGoingAway,
			"ping timeout",
		)
	}
}

func (g *Game) BuildMatchStatePacket() []byte {
	g.mu.RLock()
	defer g.mu.RUnlock()

	return buildMatchStatePacket(g)
}
