package game

import (
	"context"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type Player struct {
	ID uint16

	X float32
	Y float32

	VX float32
	VY float32

	KnockbackX float32
	KnockbackY float32

	InputX int8
	InputY int8

	Alive         bool
	DashCooldown  float32
	DashRequested bool
	Energy        float32
	Radius        float32
	Rotation      float32
	SizeLevel     uint8

	Conn     *websocket.Conn
	Done     chan struct{}
	LastPing time.Time
	Send     chan []byte
	doneOnce sync.Once
	pingMu   sync.RWMutex
}

func (p *Player) WriteLoop() {
	for {
		select {
		case <-p.Done:
			return

		case data := <-p.Send:
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
}

func sizeLevelForEnergy(energy float32) uint8 {
	switch {
	case energy >= 1000:
		return 5
	case energy >= 600:
		return 4
	case energy >= 350:
		return 3
	case energy >= 200:
		return 2
	default:
		return 1
	}
}

func radiusForSizeLevel(level uint8) float32 {
	switch level {
	case 5:
		return 40
	case 4:
		return 34
	case 3:
		return 28
	case 2:
		return 22
	default:
		return 16
	}
}

func (p *Player) MarkPing() {
	p.pingMu.Lock()
	p.LastPing = time.Now()
	p.pingMu.Unlock()
}

func (p *Player) LastPingTime() time.Time {
	p.pingMu.RLock()
	defer p.pingMu.RUnlock()

	return p.LastPing
}

func (p *Player) CloseDone() {
	p.doneOnce.Do(func() {
		close(p.Done)
	})
}
