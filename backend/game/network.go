package game

import (
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
