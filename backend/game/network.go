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

func (g *Game) BroadcastWorldState() {
	g.mu.RLock()
	snapshot := g.snapshot
	recipients := make([]*Player, 0, len(g.Players))

	for _, player := range g.Players {
		recipients = append(recipients, player)
	}
	g.mu.RUnlock()

	visible := make([]int, 0, 128)

	for _, recipient := range recipients {
		viewerIndex, exists := snapshot.ByID[recipient.ID]
		if !exists {
			recipient.ClearPendingWorldState()
			continue
		}

		viewer := snapshot.Players[viewerIndex]
		visible = snapshot.QueryCircle(
			viewer.X,
			viewer.Y,
			VisibilityRadius,
			visible,
		)

		recipient.QueueLatestWorldState(buildWorldStatePacket(snapshot, visible))
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
