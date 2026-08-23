package main

import (
	"context"
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/coder/websocket"
)

const (
	packetPing       byte = 1
	packetPong       byte = 2
	packetConnected  byte = 3
	packetInput      byte = 4
	packetWorldState byte = 5
	packetDeath      byte = 6
	packetScoreboard byte = 7
	packetMatchState byte = 9
	packetMatchReset byte = 10
	packetKill       byte = 11
)

type config struct {
	URL             string
	Bots            int
	SpawnRate       float64
	InputRate       float64
	PingInterval    time.Duration
	Duration        time.Duration
	ReconnectDelay  time.Duration
	ReconnectJitter time.Duration
	NamePrefix      string
	Origin          string
	DashChance      float64
	Seed            int64
	StatsInterval   time.Duration
	IdleChance      float64
	IdleMin         time.Duration
	IdleMax         time.Duration
	DirectionMin    time.Duration
	DirectionMax    time.Duration
	AggressiveRatio float64
	ChaseDistance   float64
	InputJitter     float64
	DialTimeout     time.Duration
	WriteTimeout    time.Duration
	ReadLimitBytes  int64
	ReactionMin     time.Duration
	ReactionMax     time.Duration
	TargetCommitMin time.Duration
	TargetCommitMax time.Duration
	MistakeChance   float64
	PanicDistance   float64
	ComfortMargin   float64
}

type counters struct {
	connecting atomic.Int64
	connected  atomic.Int64
	connectOK  atomic.Uint64
	connectErr atomic.Uint64
	disconnect atomic.Uint64
	deaths     atomic.Uint64

	messagesIn  atomic.Uint64
	messagesOut atomic.Uint64
	bytesIn     atomic.Uint64
	bytesOut    atomic.Uint64
	worldStates atomic.Uint64
	pongs       atomic.Uint64
	dashes      atomic.Uint64
	idleInputs  atomic.Uint64
}

type bot struct {
	index       int
	name        string
	cfg         config
	stats       *counters
	rng         *rand.Rand
	aggressive  bool
	orbitSign   float64
	personality personality

	mu            sync.RWMutex
	id            uint16
	x             float32
	y             float32
	energy        float32
	dashAvailable bool
	nearestX      float32
	nearestY      float32
	nearestDist   float64
	hasNearest    bool
	phase         byte
	sunScale      float32
	targetX       float32
	targetY       float32
	targetDist    float64
	hasTarget     bool
}

type personality struct {
	Aggression   float64
	Caution      float64
	Impulsivity  float64
	StickBias    float64
	TurnSkill    float64
	ReactionBias float64
}

var errDeath = errors.New("bot died")

func main() {
	cfg := parseConfig()
	if err := validateConfig(cfg); err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.Duration > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cfg.Duration)
		defer cancel()
	}

	stats := &counters{}
	go printStats(ctx, cfg, stats)

	log.Printf("starting load test: url=%s bots=%d spawn-rate=%.1f/s input-rate=%.1f/s duration=%s aggressive=%.0f%%",
		cfg.URL, cfg.Bots, cfg.SpawnRate, cfg.InputRate, cfg.Duration, cfg.AggressiveRatio*100)

	var wg sync.WaitGroup
	spawnEvery := time.Duration(float64(time.Second) / cfg.SpawnRate)
	if spawnEvery < time.Millisecond {
		spawnEvery = time.Millisecond
	}
	spawnTicker := time.NewTicker(spawnEvery)
	defer spawnTicker.Stop()

	for i := 0; i < cfg.Bots; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				i = cfg.Bots
				continue
			case <-spawnTicker.C:
			}
		}

		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			r := rand.New(rand.NewSource(cfg.Seed + int64(index)*7919))
			p := randomPersonality(r, cfg.AggressiveRatio)
			b := &bot{
				index:       index,
				name:        randomBotName(r),
				cfg:         cfg,
				stats:       stats,
				rng:         r,
				aggressive:  p.Aggression > 0.62,
				orbitSign:   chooseSign(r),
				personality: p,
			}
			b.run(ctx)
		}(i)
	}

	<-ctx.Done()
	wg.Wait()
	printFinalStats(stats)
}

func parseConfig() config {
	cfg := config{
		URL:             envString("BOT_URL", "ws://127.0.0.1:8080/ws"),
		Bots:            envInt("BOT_COUNT", 100),
		SpawnRate:       envFloat("BOT_SPAWN_RATE", 25),
		InputRate:       envFloat("BOT_INPUT_RATE", 20),
		PingInterval:    envDuration("BOT_PING_INTERVAL", 2*time.Second),
		Duration:        envDuration("BOT_DURATION", 5*time.Minute),
		ReconnectDelay:  envDuration("BOT_RECONNECT_DELAY", 750*time.Millisecond),
		ReconnectJitter: envDuration("BOT_RECONNECT_JITTER", 1250*time.Millisecond),
		NamePrefix:      envString("BOT_NAME_PREFIX", ""),
		Origin:          envString("BOT_ORIGIN", ""),
		DashChance:      envFloat("BOT_DASH_CHANCE", 0.025),
		Seed:            envInt64("BOT_SEED", 42),
		StatsInterval:   envDuration("BOT_STATS_INTERVAL", 5*time.Second),
		IdleChance:      envFloat("BOT_IDLE_CHANCE", 0.08),
		IdleMin:         envDuration("BOT_IDLE_MIN", 250*time.Millisecond),
		IdleMax:         envDuration("BOT_IDLE_MAX", 1800*time.Millisecond),
		DirectionMin:    envDuration("BOT_DIRECTION_MIN", 700*time.Millisecond),
		DirectionMax:    envDuration("BOT_DIRECTION_MAX", 3500*time.Millisecond),
		AggressiveRatio: envFloat("BOT_AGGRESSIVE_RATIO", 0.30),
		ChaseDistance:   envFloat("BOT_CHASE_DISTANCE", 900),
		InputJitter:     envFloat("BOT_INPUT_JITTER", 0.15),
		DialTimeout:     envDuration("BOT_DIAL_TIMEOUT", 5*time.Second),
		WriteTimeout:    envDuration("BOT_WRITE_TIMEOUT", 2*time.Second),
		ReadLimitBytes:  envInt64("BOT_READ_LIMIT_BYTES", 4<<20),
		ReactionMin:     envDuration("BOT_REACTION_MIN", 90*time.Millisecond),
		ReactionMax:     envDuration("BOT_REACTION_MAX", 320*time.Millisecond),
		TargetCommitMin: envDuration("BOT_TARGET_COMMIT_MIN", 600*time.Millisecond),
		TargetCommitMax: envDuration("BOT_TARGET_COMMIT_MAX", 2500*time.Millisecond),
		MistakeChance:   envFloat("BOT_MISTAKE_CHANCE", 0.035),
		PanicDistance:   envFloat("BOT_PANIC_DISTANCE", 180),
		ComfortMargin:   envFloat("BOT_COMFORT_MARGIN", 240),
	}

	flag.StringVar(&cfg.URL, "url", cfg.URL, "WebSocket endpoint (env BOT_URL)")
	flag.IntVar(&cfg.Bots, "bots", cfg.Bots, "number of concurrent bot supervisors (env BOT_COUNT)")
	flag.Float64Var(&cfg.SpawnRate, "spawn-rate", cfg.SpawnRate, "new bot connections per second (env BOT_SPAWN_RATE)")
	flag.Float64Var(&cfg.InputRate, "input-rate", cfg.InputRate, "input packets per second per connected bot (env BOT_INPUT_RATE)")
	flag.DurationVar(&cfg.PingInterval, "ping-interval", cfg.PingInterval, "application ping interval (env BOT_PING_INTERVAL)")
	flag.DurationVar(&cfg.Duration, "duration", cfg.Duration, "test duration; 0 means until interrupted (env BOT_DURATION)")
	flag.DurationVar(&cfg.ReconnectDelay, "reconnect-delay", cfg.ReconnectDelay, "base reconnect delay (env BOT_RECONNECT_DELAY)")
	flag.DurationVar(&cfg.ReconnectJitter, "reconnect-jitter", cfg.ReconnectJitter, "random reconnect delay added to base (env BOT_RECONNECT_JITTER)")
	flag.StringVar(&cfg.NamePrefix, "name-prefix", cfg.NamePrefix, "optional player name prefix (env BOT_NAME_PREFIX)")
	flag.StringVar(&cfg.Origin, "origin", cfg.Origin, "optional Origin header (env BOT_ORIGIN)")
	flag.Float64Var(&cfg.DashChance, "dash-chance", cfg.DashChance, "dash probability per active input when dash is available (env BOT_DASH_CHANCE)")
	flag.Int64Var(&cfg.Seed, "seed", cfg.Seed, "base RNG seed (env BOT_SEED)")
	flag.DurationVar(&cfg.StatsInterval, "stats-interval", cfg.StatsInterval, "stats log interval (env BOT_STATS_INTERVAL)")
	flag.Float64Var(&cfg.IdleChance, "idle-chance", cfg.IdleChance, "chance to pause when choosing a new action (env BOT_IDLE_CHANCE)")
	flag.DurationVar(&cfg.IdleMin, "idle-min", cfg.IdleMin, "minimum idle period (env BOT_IDLE_MIN)")
	flag.DurationVar(&cfg.IdleMax, "idle-max", cfg.IdleMax, "maximum idle period (env BOT_IDLE_MAX)")
	flag.DurationVar(&cfg.DirectionMin, "direction-min", cfg.DirectionMin, "minimum time to hold an intention (env BOT_DIRECTION_MIN)")
	flag.DurationVar(&cfg.DirectionMax, "direction-max", cfg.DirectionMax, "maximum time to hold an intention (env BOT_DIRECTION_MAX)")
	flag.Float64Var(&cfg.AggressiveRatio, "aggressive-ratio", cfg.AggressiveRatio, "fraction of bots that chase visible players (env BOT_AGGRESSIVE_RATIO)")
	flag.Float64Var(&cfg.ChaseDistance, "chase-distance", cfg.ChaseDistance, "maximum distance for aggressive chase behavior (env BOT_CHASE_DISTANCE)")
	flag.Float64Var(&cfg.InputJitter, "input-jitter", cfg.InputJitter, "fractional input timing jitter, e.g. 0.15 (env BOT_INPUT_JITTER)")
	flag.DurationVar(&cfg.DialTimeout, "dial-timeout", cfg.DialTimeout, "WebSocket dial timeout (env BOT_DIAL_TIMEOUT)")
	flag.DurationVar(&cfg.WriteTimeout, "write-timeout", cfg.WriteTimeout, "per-message write timeout (env BOT_WRITE_TIMEOUT)")
	flag.Int64Var(&cfg.ReadLimitBytes, "read-limit", cfg.ReadLimitBytes, "maximum incoming WebSocket message size (env BOT_READ_LIMIT_BYTES)")
	flag.DurationVar(&cfg.ReactionMin, "reaction-min", cfg.ReactionMin, "minimum behavior reaction delay (env BOT_REACTION_MIN)")
	flag.DurationVar(&cfg.ReactionMax, "reaction-max", cfg.ReactionMax, "maximum behavior reaction delay (env BOT_REACTION_MAX)")
	flag.DurationVar(&cfg.TargetCommitMin, "target-commit-min", cfg.TargetCommitMin, "minimum time to stick with a chosen target (env BOT_TARGET_COMMIT_MIN)")
	flag.DurationVar(&cfg.TargetCommitMax, "target-commit-max", cfg.TargetCommitMax, "maximum time to stick with a chosen target (env BOT_TARGET_COMMIT_MAX)")
	flag.Float64Var(&cfg.MistakeChance, "mistake-chance", cfg.MistakeChance, "chance of a small human-like input mistake per decision (env BOT_MISTAKE_CHANCE)")
	flag.Float64Var(&cfg.PanicDistance, "panic-distance", cfg.PanicDistance, "distance at which cautious bots evade nearby players (env BOT_PANIC_DISTANCE)")
	flag.Float64Var(&cfg.ComfortMargin, "comfort-margin", cfg.ComfortMargin, "preferred safety margin outside the sun (env BOT_COMFORT_MARGIN)")
	flag.Parse()
	return cfg
}

func validateConfig(cfg config) error {
	switch {
	case cfg.Bots <= 0:
		return errors.New("bot count must be > 0")
	case cfg.SpawnRate <= 0:
		return errors.New("spawn rate must be > 0")
	case cfg.InputRate <= 0:
		return errors.New("input rate must be > 0")
	case cfg.PingInterval <= 0 || cfg.PingInterval >= 5*time.Second:
		return errors.New("ping interval must be > 0 and < 5s for this server")
	case cfg.ReconnectDelay < 0 || cfg.ReconnectJitter < 0:
		return errors.New("reconnect delays must be >= 0")
	case !probability(cfg.DashChance) || !probability(cfg.IdleChance) || !probability(cfg.AggressiveRatio):
		return errors.New("dash chance, idle chance and aggressive ratio must be between 0 and 1")
	case cfg.IdleMin < 0 || cfg.IdleMax < cfg.IdleMin:
		return errors.New("idle range is invalid")
	case cfg.DirectionMin <= 0 || cfg.DirectionMax < cfg.DirectionMin:
		return errors.New("direction range is invalid")
	case cfg.ChaseDistance <= 0:
		return errors.New("chase distance must be > 0")
	case cfg.InputJitter < 0 || cfg.InputJitter >= 1:
		return errors.New("input jitter must be >= 0 and < 1")
	case cfg.DialTimeout <= 0 || cfg.WriteTimeout <= 0:
		return errors.New("dial/write timeouts must be > 0")
	case cfg.ReadLimitBytes <= 0:
		return errors.New("read limit must be > 0")
	case cfg.StatsInterval <= 0:
		return errors.New("stats interval must be > 0")
	case cfg.ReactionMin < 0 || cfg.ReactionMax < cfg.ReactionMin:
		return errors.New("reaction delay range is invalid")
	case cfg.TargetCommitMin <= 0 || cfg.TargetCommitMax < cfg.TargetCommitMin:
		return errors.New("target commit range is invalid")
	case !probability(cfg.MistakeChance):
		return errors.New("mistake chance must be between 0 and 1")
	case cfg.PanicDistance <= 0 || cfg.ComfortMargin <= 0:
		return errors.New("panic distance and comfort margin must be > 0")
	}
	return nil
}

func probability(v float64) bool { return v >= 0 && v <= 1 }

func (b *bot) run(ctx context.Context) {
	for ctx.Err() == nil {
		_ = b.runSession(ctx)
		if ctx.Err() != nil {
			return
		}

		delay := b.cfg.ReconnectDelay
		if b.cfg.ReconnectJitter > 0 {
			delay += time.Duration(b.rng.Int63n(int64(b.cfg.ReconnectJitter) + 1))
		}
		if !sleepContext(ctx, delay) {
			return
		}
	}
}

func (b *bot) runSession(parent context.Context) error {
	b.stats.connecting.Add(1)
	defer b.stats.connecting.Add(-1)

	name := b.name
	if b.cfg.NamePrefix != "" {
		name = b.cfg.NamePrefix + name
		runes := []rune(name)
		if len(runes) > 16 {
			name = string(runes[:16])
		}
	}

	wsURL, err := url.Parse(b.cfg.URL)
	if err != nil {
		return fmt.Errorf("parse websocket URL: %w", err)
	}
	q := wsURL.Query()
	q.Set("name", name)
	wsURL.RawQuery = q.Encode()

	headers := http.Header{}
	if b.cfg.Origin != "" {
		headers.Set("Origin", b.cfg.Origin)
	}

	dialCtx, cancelDial := context.WithTimeout(parent, b.cfg.DialTimeout)
	conn, resp, err := websocket.Dial(dialCtx, wsURL.String(), &websocket.DialOptions{HTTPHeader: headers})
	cancelDial()
	if err != nil {
		b.stats.connectErr.Add(1)
		if resp != nil && resp.Body != nil {
			_ = resp.Body.Close()
		}
		return err
	}
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer conn.CloseNow()

	conn.SetReadLimit(b.cfg.ReadLimitBytes)
	b.stats.connectOK.Add(1)
	b.stats.connected.Add(1)
	defer func() {
		b.stats.connected.Add(-1)
		b.stats.disconnect.Add(1)
	}()

	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	errCh := make(chan error, 3)
	go func() { errCh <- b.readLoop(ctx, conn) }()
	go func() { errCh <- b.inputLoop(ctx, conn) }()
	go func() { errCh <- b.pingLoop(ctx, conn) }()

	select {
	case <-parent.Done():
		cancel()
		_ = conn.Close(websocket.StatusNormalClosure, "load test complete")
		return parent.Err()
	case err := <-errCh:
		cancel()
		return err
	}
}

func (b *bot) readLoop(ctx context.Context, conn *websocket.Conn) error {
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		if typ != websocket.MessageBinary || len(data) == 0 {
			continue
		}

		b.stats.messagesIn.Add(1)
		b.stats.bytesIn.Add(uint64(len(data)))

		switch data[0] {
		case packetConnected:
			b.parseConnected(data)
		case packetWorldState:
			b.stats.worldStates.Add(1)
			b.parseWorldState(data)
		case packetPong:
			b.stats.pongs.Add(1)
		case packetMatchState:
			b.parseMatchState(data)
		case packetDeath:
			b.stats.deaths.Add(1)
			return errDeath
		case packetScoreboard, packetMatchReset, packetKill:
			// Drained to reproduce normal client network pressure.
		}
	}
}

func (b *bot) parseConnected(data []byte) {
	if len(data) != 15 {
		return
	}
	b.mu.Lock()
	b.id = binary.BigEndian.Uint16(data[1:3])
	b.x = math.Float32frombits(binary.BigEndian.Uint32(data[3:7]))
	b.y = math.Float32frombits(binary.BigEndian.Uint32(data[7:11]))
	b.hasNearest = false
	b.mu.Unlock()
}

func (b *bot) parseWorldState(data []byte) {
	if len(data) < 3 {
		return
	}

	b.mu.RLock()
	myID := b.id
	myX, myY := b.x, b.y
	b.mu.RUnlock()
	if myID == 0 {
		return
	}

	count := int(binary.BigEndian.Uint16(data[1:3]))
	offset := 3
	nearestDist := math.MaxFloat64
	var nearestX, nearestY float32
	hasNearest := false

	for i := 0; i < count; i++ {
		if offset+22 > len(data) {
			return
		}

		id := binary.BigEndian.Uint16(data[offset : offset+2])
		x := math.Float32frombits(binary.BigEndian.Uint32(data[offset+2 : offset+6]))
		y := math.Float32frombits(binary.BigEndian.Uint32(data[offset+6 : offset+10]))
		energy := math.Float32frombits(binary.BigEndian.Uint32(data[offset+14 : offset+18]))
		dashAvailable := data[offset+19] == 1
		nameLen := int(data[offset+21])
		offset += 22
		if offset+nameLen > len(data) {
			return
		}

		if id == myID {
			b.mu.Lock()
			b.x = x
			b.y = y
			b.energy = energy
			b.dashAvailable = dashAvailable
			b.mu.Unlock()
			myX, myY = x, y
		} else {
			dx := float64(x - myX)
			dy := float64(y - myY)
			d := math.Hypot(dx, dy)
			if d < nearestDist {
				nearestDist = d
				nearestX, nearestY = x, y
				hasNearest = true
			}
		}
		offset += nameLen
	}

	b.mu.Lock()
	b.nearestX = nearestX
	b.nearestY = nearestY
	b.nearestDist = nearestDist
	b.hasNearest = hasNearest
	b.mu.Unlock()
}

func (b *bot) parseMatchState(data []byte) {
	if len(data) != 10 {
		return
	}
	b.mu.Lock()
	b.phase = data[1]
	b.sunScale = math.Float32frombits(binary.BigEndian.Uint32(data[6:10]))
	b.mu.Unlock()
}

func (b *bot) inputLoop(ctx context.Context, conn *websocket.Conn) error {
	base := time.Duration(float64(time.Second) / b.cfg.InputRate)
	if base < time.Millisecond {
		base = time.Millisecond
	}

	angle := b.rng.Float64() * 2 * math.Pi
	targetAngle := angle
	nextDecision := time.Now()
	actionUntil := time.Now()
	idleUntil := time.Time{}
	targetCommitUntil := time.Time{}

	if !sleepContext(ctx, randomDuration(b.rng, 0, base)) {
		return ctx.Err()
	}

	for {
		now := time.Now()
		idle := now.Before(idleUntil)

		if now.After(nextDecision) {
			reaction := randomDuration(b.rng, b.cfg.ReactionMin, b.cfg.ReactionMax)
			reaction = time.Duration(float64(reaction) * b.personality.ReactionBias)
			nextDecision = now.Add(reaction)

			if !idle && now.After(actionUntil) && b.rng.Float64() < b.cfg.IdleChance*(1.25-b.personality.Impulsivity*0.5) {
				idleUntil = now.Add(randomDuration(b.rng, b.cfg.IdleMin, b.cfg.IdleMax))
				idle = true
			}

			if !idle {
				if now.After(targetCommitUntil) {
					b.refreshCommittedTarget()
					targetCommitUntil = now.Add(randomDuration(b.rng, b.cfg.TargetCommitMin, b.cfg.TargetCommitMax))
				}
				targetAngle = b.chooseHumanTargetAngle(angle)
				actionUntil = now.Add(randomDuration(b.rng, b.cfg.DirectionMin, b.cfg.DirectionMax))

				// Occasional indecision / correction like a mouse or stick overshoot.
				if b.rng.Float64() < b.cfg.MistakeChance {
					targetAngle += (b.rng.Float64()*2 - 1) * (0.25 + 0.45*b.personality.Impulsivity)
				}
				if b.rng.Float64() < 0.025+0.08*b.personality.Impulsivity {
					b.orbitSign *= -1
				}
			}
		}

		var xInput, yInput int8
		dash := byte(0)

		if idle {
			b.stats.idleInputs.Add(1)
		} else {
			// Human steering is smooth but imperfect. Better "players" turn faster.
			delta := normalizeAngle(targetAngle - angle)
			maxTurn := 0.055 + 0.12*b.personality.TurnSkill + b.rng.Float64()*0.045
			if delta > maxTurn {
				delta = maxTurn
			} else if delta < -maxTurn {
				delta = -maxTurn
			}
			angle = normalizeAngle(angle + delta)

			// Persist a personal stick pressure instead of redrawing a fully random value every frame.
			magnitude := b.personality.StickBias + (b.rng.Float64()*2-1)*0.055
			if magnitude < 0.42 {
				magnitude = 0.42
			}
			if magnitude > 1 {
				magnitude = 1
			}
			xInput = int8(math.Round(math.Cos(angle) * 127 * magnitude))
			yInput = int8(math.Round(math.Sin(angle) * 127 * magnitude))

			b.mu.RLock()
			dashAvailable := b.dashAvailable
			targetDist := b.targetDist
			hasTarget := b.hasTarget
			x, y := b.x, b.y
			sunScale := b.sunScale
			b.mu.RUnlock()

			// Dash with context: chase, escape a close player, or recover from the sun edge.
			if dashAvailable {
				distFromCenter := math.Hypot(float64(x), float64(y))
				sunRadius := float64(sunScale) * 300.0
				nearSun := sunRadius > 0 && distFromCenter-sunRadius < b.cfg.ComfortMargin*0.55
				panic := hasTarget && targetDist < b.cfg.PanicDistance
				chasing := hasTarget && targetDist < b.cfg.ChaseDistance && b.personality.Aggression > 0.55
				chance := b.cfg.DashChance * (0.35 + b.personality.Impulsivity)
				if nearSun {
					chance *= 5.0
				} else if panic && b.personality.Caution > 0.55 {
					chance *= 3.0
				} else if chasing {
					chance *= 2.2
				}
				if b.rng.Float64() < chance {
					dash = 1
					b.stats.dashes.Add(1)
				}
			}
		}

		data := []byte{packetInput, byte(xInput), byte(yInput), dash}
		if err := b.writeBinary(ctx, conn, data); err != nil {
			return err
		}
		b.stats.messagesOut.Add(1)
		b.stats.bytesOut.Add(uint64(len(data)))

		jitter := 1 + ((b.rng.Float64()*2 - 1) * b.cfg.InputJitter)
		if !sleepContext(ctx, time.Duration(float64(base)*jitter)) {
			return ctx.Err()
		}
	}
}

func (b *bot) refreshCommittedTarget() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.hasNearest && b.nearestDist <= b.cfg.ChaseDistance*1.25 {
		b.targetX = b.nearestX
		b.targetY = b.nearestY
		b.targetDist = b.nearestDist
		b.hasTarget = true
		return
	}
	b.hasTarget = false
	b.targetDist = math.MaxFloat64
}

func (b *bot) chooseHumanTargetAngle(current float64) float64 {
	b.mu.RLock()
	x, y := b.x, b.y
	tx, ty := b.targetX, b.targetY
	targetDist := b.targetDist
	hasTarget := b.hasTarget
	energy := b.energy
	sunScale := b.sunScale
	b.mu.RUnlock()

	// First priority: don't casually die to the expanding sun. Humans give themselves
	// different safety margins and don't react at exactly the same radius.
	distFromCenter := math.Hypot(float64(x), float64(y))
	sunRadius := float64(sunScale) * 300.0
	personalMargin := b.cfg.ComfortMargin * (0.65 + 0.7*b.personality.Caution)
	if sunRadius > 0 && distFromCenter-sunRadius < personalMargin {
		outward := math.Atan2(float64(y), float64(x))
		// Panic is not perfectly radial: keep some tangential motion.
		return outward + b.orbitSign*(0.10+0.35*(1-b.personality.Caution)) + (b.rng.Float64()*2-1)*0.08
	}

	if hasTarget {
		toTarget := math.Atan2(float64(ty-y), float64(tx-x))
		if targetDist < b.cfg.PanicDistance && b.personality.Caution > b.personality.Aggression {
			// Cautious players disengage rather than suiciding into a close collision.
			return normalizeAngle(toTarget + math.Pi + b.orbitSign*0.28)
		}
		if targetDist <= b.cfg.ChaseDistance && b.personality.Aggression > 0.48 {
			// Approach with a strafe offset instead of perfect homing.
			strafe := b.orbitSign * (0.12 + 0.42*(1-b.personality.Aggression))
			aimNoise := (b.rng.Float64()*2 - 1) * (0.06 + 0.22*(1-b.personality.TurnSkill))
			return toTarget + strafe + aimNoise
		}
	}

	if x != 0 || y != 0 {
		radial := math.Atan2(float64(y), float64(x))
		tangent := radial + b.orbitSign*math.Pi/2

		// Wander in broad arcs. Low-energy/cautious players favor safer outward lines;
		// impulsive players cut across the arena more often.
		radialMix := (b.rng.Float64()*2 - 1) * (0.18 + 0.48*b.personality.Impulsivity)
		if energy > 0 && energy < 250 {
			radialMix += b.orbitSign * 0.20 * b.personality.Caution
		}
		return tangent + radialMix
	}

	return current + (b.rng.Float64()*2-1)*0.55
}

func randomPersonality(r *rand.Rand, aggressiveRatio float64) personality {
	// Continuous traits avoid obvious discrete bot classes. The aggression ratio
	// still shifts the population toward aggressive behavior for load shaping.
	aggression := clamp01(0.15 + r.Float64()*0.55)
	if r.Float64() < aggressiveRatio {
		aggression = clamp01(0.55 + r.Float64()*0.45)
	}
	return personality{
		Aggression:   aggression,
		Caution:      clamp01(0.18 + r.Float64()*0.78),
		Impulsivity:  clamp01(0.12 + r.Float64()*0.80),
		StickBias:    0.68 + r.Float64()*0.30,
		TurnSkill:    0.35 + r.Float64()*0.65,
		ReactionBias: 0.75 + r.Float64()*0.70,
	}
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func (b *bot) pingLoop(ctx context.Context, conn *websocket.Conn) error {
	if !sleepContext(ctx, randomDuration(b.rng, 0, b.cfg.PingInterval)) {
		return ctx.Err()
	}

	for {
		data := []byte{packetPing}
		if err := b.writeBinary(ctx, conn, data); err != nil {
			return err
		}
		b.stats.messagesOut.Add(1)
		b.stats.bytesOut.Add(1)

		// Small ping jitter better approximates browser scheduling.
		jitter := 0.95 + b.rng.Float64()*0.10
		if !sleepContext(ctx, time.Duration(float64(b.cfg.PingInterval)*jitter)) {
			return ctx.Err()
		}
	}
}

func (b *bot) writeBinary(ctx context.Context, conn *websocket.Conn, data []byte) error {
	writeCtx, cancel := context.WithTimeout(ctx, b.cfg.WriteTimeout)
	defer cancel()
	return conn.Write(writeCtx, websocket.MessageBinary, data)
}

var botAdjectives = []string{
	"Solar", "Swift", "Wild", "Lunar", "Neon", "Cosmic", "Frost", "Nova",
	"Bright", "Shadow", "Turbo", "Lucky", "Blaze", "Storm", "Pixel", "Rapid",
	"Silent", "Tiny", "Hyper", "Misty", "Amber", "Aqua", "Crimson", "Cloudy",
}

var botNouns = []string{
	"Otter", "Fox", "Hawk", "Wolf", "Lynx", "Moth", "Ray", "Panda",
	"Comet", "Orbit", "Flare", "Drift", "Viper", "Raven", "Gecko", "Crab",
	"Koala", "Finch", "Mantis", "Kite", "Badger", "Newt", "Robin", "Mako",
}

func randomBotName(rng *rand.Rand) string {
	adj := botAdjectives[rng.Intn(len(botAdjectives))]
	noun := botNouns[rng.Intn(len(botNouns))]
	num := rng.Intn(1000)
	name := fmt.Sprintf("%s%s%03d", adj, noun, num)
	runes := []rune(name)
	if len(runes) > 16 {
		name = string(runes[:16])
	}
	return name
}

func chooseSign(r *rand.Rand) float64 {
	if r.Intn(2) == 0 {
		return -1
	}
	return 1
}

func normalizeAngle(a float64) float64 {
	for a > math.Pi {
		a -= 2 * math.Pi
	}
	for a < -math.Pi {
		a += 2 * math.Pi
	}
	return a
}

func randomDuration(rng *rand.Rand, min, max time.Duration) time.Duration {
	if max <= min {
		return min
	}
	return min + time.Duration(rng.Int63n(int64(max-min)))
}

func sleepContext(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return ctx.Err() == nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

func printStats(ctx context.Context, cfg config, s *counters) {
	ticker := time.NewTicker(cfg.StatsInterval)
	defer ticker.Stop()

	var lastIn, lastOut, lastBytesIn, lastBytesOut uint64
	last := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			dt := now.Sub(last).Seconds()
			in := s.messagesIn.Load()
			out := s.messagesOut.Load()
			bin := s.bytesIn.Load()
			bout := s.bytesOut.Load()

			log.Printf("active=%d connecting=%d connect_ok=%d connect_err=%d deaths=%d dashes=%d | in=%.0f msg/s %.2f MiB/s out=%.0f msg/s %.2f MiB/s",
				s.connected.Load(), s.connecting.Load(), s.connectOK.Load(), s.connectErr.Load(), s.deaths.Load(), s.dashes.Load(),
				float64(in-lastIn)/dt, float64(bin-lastBytesIn)/dt/(1024*1024),
				float64(out-lastOut)/dt, float64(bout-lastBytesOut)/dt/(1024*1024),
			)

			lastIn, lastOut = in, out
			lastBytesIn, lastBytesOut = bin, bout
			last = now
		}
	}
}

func printFinalStats(s *counters) {
	log.Printf("final: connected=%d connect_ok=%d connect_err=%d disconnects=%d deaths=%d dashes=%d idle_inputs=%d messages_in=%d messages_out=%d bytes_in=%d bytes_out=%d world_states=%d pongs=%d",
		s.connected.Load(), s.connectOK.Load(), s.connectErr.Load(), s.disconnect.Load(), s.deaths.Load(), s.dashes.Load(), s.idleInputs.Load(),
		s.messagesIn.Load(), s.messagesOut.Load(), s.bytesIn.Load(), s.bytesOut.Load(),
		s.worldStates.Load(), s.pongs.Load())
}

func envString(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Fatalf("invalid %s=%q: %v", key, v, err)
	}
	return n
}

func envInt64(key string, fallback int64) int64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		log.Fatalf("invalid %s=%q: %v", key, v, err)
	}
	return n
}

func envFloat(key string, fallback float64) float64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		log.Fatalf("invalid %s=%q: %v", key, v, err)
	}
	return n
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		log.Fatalf("invalid %s=%q: %v", key, v, err)
	}
	return d
}
