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

	Conn       *websocket.Conn
	Disconnect chan struct{}
	Done       chan struct{}
	LastPing   time.Time
	Lifecycle  chan []byte
	Send       chan []byte

	disconnectOnce sync.Once
	doneOnce       sync.Once
	pingMu         sync.RWMutex
}

func (p *Player) WriteLoop() {
	for {
		var data []byte

		// Lifecycle packets take precedence over replaceable state updates.
		select {
		case <-p.Done:
			return
		case <-p.Disconnect:
			p.Conn.CloseNow()
			return
		case data = <-p.Lifecycle:
		default:
			select {
			case <-p.Done:
				return
			case <-p.Disconnect:
				p.Conn.CloseNow()
				return
			case data = <-p.Lifecycle:
			case data = <-p.Send:
			}
		}

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
			p.Conn.CloseNow()
			return
		}
	}
}

func (p *Player) QueueLifecyclePacket(data []byte) {
	select {
	case p.Lifecycle <- data:
	default:
		p.RequestDisconnect()
	}
}

func (p *Player) RequestDisconnect() {
	if p.Disconnect == nil {
		return
	}

	p.disconnectOnce.Do(func() {
		close(p.Disconnect)
	})
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
