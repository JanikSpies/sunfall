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

// Mirrors backend/game/game.go's constants of the same name -- the bot has no
// server-side access to them, so these are hardcoded to match.
const (
	sunStartRadius        = 300.0
	neutralEnergyDistance = 750.0
)

// combatPhase is the bot's current top-level intention, decided once per
// reaction tick in updateCombatPhase and read by both the steering (target
// angle) and dash-decision code so the two stay consistent with each other.
type combatPhase int

const (
	// No threat worth reacting to: hold station in the sun's gain zone.
	phaseFarm combatPhase = iota
	// Outmatched or unwilling to fight: run.
	phaseEvade
	// Maneuvering to the far side of the target (relative to the sun) before
	// committing -- see updateCombatPhase for why the position matters.
	phasePosition
	// Aligned and close enough: dash straight at the target.
	phaseStrike
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
	AttackStandoff  float64
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
	// Preferred distance from the sun's surface while farming, in the gain
	// zone (0..neutralEnergyDistance). Set once at creation from personality
	// so each bot consistently holds its own orbit instead of redrawing a
	// random target radius every tick.
	farmRadius float64

	mu            sync.RWMutex
	id            uint16
	x             float32
	y             float32
	energy        float32
	size          uint8
	dashAvailable bool

	nearestX        float32
	nearestY        float32
	nearestDist     float64
	nearestSize     uint8
	nearestEnergy   float32
	nearestRotation float32
	// True while the nearest player is still within its post-dash cooldown
	// (see backend/game/update.go) -- i.e. it very recently burst forward and
	// is still carrying that velocity. Read by dodgeAngle.
	nearestDashed bool
	hasNearest    bool

	phase    byte
	sunScale float32

	combatPhase combatPhase
	targetX     float32
	targetY     float32
	targetDist  float64
	hasTarget   bool
	// Flanking point computed in phasePosition: on the far side of the target
	// from the sun, so the final approach into phaseStrike comes in sunward.
	waypointX float32
	waypointY float32
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
				// Well outside this bot's own panic margin (personalSunMargin) --
				// otherwise the farming target and the sun-safety override fight
				// each other right at the sun's edge, which is exactly backwards
				// for a behavior that's supposed to be safer than free wandering.
				// Still comfortably inside the gain zone (neutralEnergyDistance
				// past the surface) for every personality.
				farmRadius: personalSunMargin(cfg, p)*1.6 + r.Float64()*150,
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
		ComfortMargin:   envFloat("BOT_COMFORT_MARGIN", 160),
		AttackStandoff:  envFloat("BOT_ATTACK_STANDOFF", 220),
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
	flag.Float64Var(&cfg.AttackStandoff, "attack-standoff", cfg.AttackStandoff, "flanking distance past the target, further from the sun, before committing to a kill dash (env BOT_ATTACK_STANDOFF)")
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
	case cfg.AttackStandoff <= 0:
		return errors.New("attack standoff must be > 0")
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
	// Tells the backend this connection is synthetic load/demo traffic (see
	// Player.IsBot) so it's excluded everywhere from analytics -- Grafana
	// must look identical whether or not bots are running.
	q.Set("bot", "1")
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
	b.hasTarget = false
	b.combatPhase = phaseFarm
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
	var nearestSize uint8
	var nearestEnergy float32
	var nearestRotation float32
	var nearestDashed bool
	hasNearest := false

	for i := 0; i < count; i++ {
		if offset+22 > len(data) {
			return
		}

		id := binary.BigEndian.Uint16(data[offset : offset+2])
		x := math.Float32frombits(binary.BigEndian.Uint32(data[offset+2 : offset+6]))
		y := math.Float32frombits(binary.BigEndian.Uint32(data[offset+6 : offset+10]))
		rotation := math.Float32frombits(binary.BigEndian.Uint32(data[offset+10 : offset+14]))
		energy := math.Float32frombits(binary.BigEndian.Uint32(data[offset+14 : offset+18]))
		size := data[offset+18]
		dashAvailable := data[offset+19] == 1
		dashed := data[offset+20] == 1
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
			b.size = size
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
				nearestSize = size
				nearestEnergy = energy
				nearestRotation = rotation
				nearestDashed = dashed
				hasNearest = true
			}
		}
		offset += nameLen
	}

	b.mu.Lock()
	b.nearestX = nearestX
	b.nearestY = nearestY
	b.nearestDist = nearestDist
	b.nearestSize = nearestSize
	b.nearestEnergy = nearestEnergy
	b.nearestRotation = nearestRotation
	b.nearestDashed = nearestDashed
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

			b.mu.RLock()
			inCombat := b.combatPhase == phasePosition || b.combatPhase == phaseStrike
			b.mu.RUnlock()

			// Never idle mid-maneuver -- a bot doesn't pause to stare into space
			// while lining up or committing to a kill.
			if !idle && !inCombat && now.After(actionUntil) && b.rng.Float64() < b.cfg.IdleChance*(1.25-b.personality.Impulsivity*0.5) {
				idleUntil = now.Add(randomDuration(b.rng, b.cfg.IdleMin, b.cfg.IdleMax))
				idle = true
			}

			if !idle {
				if now.After(targetCommitUntil) {
					b.updateCombatPhase()
					targetCommitUntil = now.Add(randomDuration(b.rng, b.cfg.TargetCommitMin, b.cfg.TargetCommitMax))
				}
				targetAngle = b.chooseHumanTargetAngle()
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

		// Reflex, not a decision: re-checked every tick regardless of the reaction
		// cadence above. Farming and combat both now routinely put a bot right at
		// the sun's edge, and a dash's momentum can carry it the rest of the way in
		// well within one decision interval -- waiting for the next strategic
		// decision to notice would be too slow.
		b.mu.RLock()
		panicX, panicY, panicSunScale, panicEnergy := b.x, b.y, b.sunScale, b.energy
		b.mu.RUnlock()
		dodging := false
		if panicAngle, inDanger := b.sunPanicAngle(panicX, panicY, panicSunScale); inDanger {
			// Imminent sun contact takes priority over everything else, dodge included.
			targetAngle = panicAngle
			idle = false
		} else if dodgeAngle, shouldDodge := b.dodgeAngle(panicX, panicY); shouldDodge {
			// An incoming dash is also a reflex-speed event -- worth reacting to
			// on the same per-tick cadence as the sun/energy checks rather than
			// waiting for the next strategic decision.
			targetAngle = dodgeAngle
			idle = false
			dodging = true
		} else if panicAngle, inDanger := b.energyPanicAngle(panicX, panicY, panicEnergy); inDanger {
			targetAngle = panicAngle
			idle = false
		}

		var xInput, yInput int8
		dash := byte(0)

		if idle {
			b.stats.idleInputs.Add(1)
		} else {
			// Human steering is smooth but imperfect. Better "players" turn faster.
			// A dodge is a flinch, not a deliberate turn -- snap straight to it
			// instead of easing in like every other maneuver, or the incoming
			// dash is long past by the time the turn catches up.
			maxTurn := 0.055 + 0.12*b.personality.TurnSkill + b.rng.Float64()*0.045
			if dodging {
				maxTurn = math.Pi
			}
			delta := normalizeAngle(targetAngle - angle)
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
			// Full commitment while dodging -- same reasoning as maxTurn above.
			if dodging {
				magnitude = 1
			}
			xInput = int8(math.Round(math.Cos(angle) * 127 * magnitude))
			yInput = int8(math.Round(math.Sin(angle) * 127 * magnitude))

			b.mu.RLock()
			dashAvailable := b.dashAvailable
			targetDist := b.targetDist
			phase := b.combatPhase
			x, y := b.x, b.y
			sunScale := b.sunScale
			b.mu.RUnlock()

			// Dash with context: escape the sun edge, burst out of a close threat,
			// close the gap to the flanking waypoint, or commit to the kill run.
			// These read the same combatPhase chooseHumanTargetAngle just steered
			// toward, so the dash always matches the maneuver in progress.
			if dashAvailable {
				distFromCenter := math.Hypot(float64(x), float64(y))
				sunRadius := float64(sunScale) * sunStartRadius
				nearSun := sunRadius > 0 && distFromCenter-sunRadius < b.cfg.ComfortMargin*0.55

				chance := b.cfg.DashChance * (0.35 + b.personality.Impulsivity)
				switch {
				case nearSun:
					chance *= 5.0
				case dodging:
					// The sidestep itself needs to be fast enough to actually clear
					// the attacker's line before their dash reaches this bot --
					// base movement speed alone often isn't, so lean hard on using
					// its own dash to do it.
					chance *= 4.5
				case phase == phaseStrike:
					// The kill run: committed far more readily than the other,
					// lower-stakes dash chances, but not a near-certainty every
					// single tick -- at high bot density near a tight, shared
					// safety margin, a near-100% commit rate made literally every
					// close encounter a kill (measured: 10 bots, avg lifespan
					// under 2s). Some misses/near-misses are the point.
					chance = 0.35 + b.personality.Aggression*0.25
				case phase == phaseEvade && targetDist < b.cfg.PanicDistance:
					chance *= 3.0
				case phase == phasePosition && targetDist > b.cfg.AttackStandoff*1.6:
					// "Going out": burst toward the flanking waypoint instead of
					// slowly flying there.
					chance *= 2.5
				case phase == phaseFarm:
					// DashEnergyCost (50) against a max gain rate of 20/s -- a dash
					// every few seconds "just because" (the old baseline chance,
					// tuned back when bots never held a stable position anyway)
					// eats most of what farming earns. Nothing to spend it on while
					// calmly holding station, so mostly don't.
					chance *= 0.1
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

// updateCombatPhase decides what the bot is currently trying to do, based on
// the nearest player last seen in parseWorldState. Both chooseHumanTargetAngle
// (steering) and the dash decision in inputLoop read the result, so they never
// disagree about what maneuver is in progress.
func (b *bot) updateCombatPhase() {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.hasNearest || b.nearestDist > b.cfg.ChaseDistance {
		b.hasTarget = false
		b.combatPhase = phaseFarm
		return
	}

	x, y := b.x, b.y
	tx, ty := b.nearestX, b.nearestY
	nearestDist := b.nearestDist

	// Multiple bots farming the same stretch of sun's gain zone are
	// constantly within ChaseDistance of each other just by both doing
	// exactly what they're supposed to -- that's normal, not a fight. Only
	// someone genuinely invading personal space always gets a reaction
	// (self-defense, regardless of energy or mood); everyone else sharing
	// the patch is, by default, left alone to farm in peace.
	const personalSpaceRadius = 150
	invadingSpace := nearestDist < personalSpaceRadius
	alreadyEngaged := b.combatPhase == phaseEvade || b.combatPhase == phasePosition || b.combatPhase == phaseStrike

	if !invadingSpace && !alreadyEngaged {
		// A fresh spawn starts on 100 energy; a strike dash alone costs
		// DashEnergyCost (50), and positioning for one can wander outside the
		// gain zone for a while. Without this, a bot that spots someone before
		// it has ever farmed goes straight for a fight and starves mid-maneuver
		// -- energy depletion, not the sun or the opponent, was the actual
		// killer found by testing this.
		const engageEnergyFloor = 150
		if b.energy < engageEnergyFloor {
			b.hasTarget = false
			b.combatPhase = phaseFarm
			return
		}

		// Most players sharing the same patch are just fellow farmers, not
		// worth a fight -- only occasionally decide to actually start one.
		// personality.Aggression shifts this per bot. Re-rolled on the same
		// cadence this function itself runs at (TargetCommit*, see its call
		// site), so a "not interested" decision sticks for a while instead of
		// flip-flopping every tick a neighbor happens to be in range.
		engageChance := 0.04 + 0.18*b.personality.Aggression
		if b.rng.Float64() >= engageChance {
			b.hasTarget = false
			b.combatPhase = phaseFarm
			return
		}
	}

	b.targetX, b.targetY = tx, ty
	b.targetDist = nearestDist
	b.hasTarget = true

	// Bigger opponents hit harder (resolvePlayerCollision splits knockback by
	// each side's radius share), and more energy tends to mean more size
	// headroom coming. Don't pick fights that are actually bad odds; do press
	// an advantage against something smaller. Aggression/Caution give each
	// bot its own risk tolerance around that baseline.
	// energyEdge already weighs my own energy against theirs, and the separate
	// energyPanicAngle reflex is the real safety net if a fight goes wrong
	// while low -- lowEnergy alone shouldn't force a retreat here, or a bot
	// would keep declining to defend the very patch it's low on energy from
	// having farmed in the first place.
	sizeEdge := float64(int(b.nearestSize) - int(b.size))
	energyEdge := clampAbs((float64(b.nearestEnergy)-float64(b.energy))/2000, 0.3)
	threat := b.personality.Caution - b.personality.Aggression + sizeEdge*0.22 + energyEdge
	if threat >= 0.15 {
		b.combatPhase = phaseEvade
		return
	}

	// A dash's knockback lands along the attacker->victim line and continues
	// past the victim (see resolvePlayerCollision), so an attacker standing
	// further from the sun than the target sends it further out along
	// roughly that same line when it strikes -- i.e. toward the sun on net --
	// without needing to first line up on the target's exact radial line.
	// That precise alignment was the actual bug here: it demanded the
	// attacker basically be on the one ray passing through the sun and the
	// target's *current* position, which sweeps past too fast to ever lock
	// onto against a target orbiting tight and fast near the sun (small
	// radius, same linear speed => high angular speed) -- bots would get
	// right next to a close-orbiting target and just never pull the trigger.
	outX, outY := normalize(float64(tx), float64(ty))
	myDistFromCenter := math.Hypot(float64(x), float64(y))
	targetDistFromCenter := math.Hypot(float64(tx), float64(ty))
	outerPosition := myDistFromCenter > targetDistFromCenter*0.92

	if outerPosition && b.targetDist <= b.cfg.AttackStandoff*1.3 {
		b.combatPhase = phaseStrike
		return
	}

	// Not outer-positioned yet (or not close enough): head for a point
	// further out along the target's own radial line first ("going out"),
	// which puts the final approach from there on a naturally-inward line
	// ("turning in") without needing to hit that line exactly.
	b.combatPhase = phasePosition
	b.waypointX = tx + float32(outX*b.cfg.AttackStandoff)
	b.waypointY = ty + float32(outY*b.cfg.AttackStandoff)
}

// sunPanicAngle is the bot's reflex, not a decision -- see its call site in
// inputLoop for why it's checked every tick instead of at the slower
// reaction-paced cadence chooseHumanTargetAngle runs at.
func (b *bot) sunPanicAngle(x, y float32, sunScale float32) (float64, bool) {
	distFromCenter := math.Hypot(float64(x), float64(y))
	sunRadius := float64(sunScale) * sunStartRadius
	personalMargin := personalSunMargin(b.cfg, b.personality)
	if sunRadius <= 0 || distFromCenter-sunRadius >= personalMargin {
		return 0, false
	}
	outward := math.Atan2(float64(y), float64(x))
	// Panic is not perfectly radial: keep some tangential motion.
	return outward + b.orbitSign*(0.10+0.35*(1-b.personality.Caution)) + (b.rng.Float64()*2-1)*0.08, true
}

// energyPanicAngle is the other emergency reflex, mirroring sunPanicAngle:
// once energy is nearly gone, a near-direct beeline back to the sun (not the
// gentler, partly-tangential correction farmAngle uses further out) is what
// actually determines whether the 5s zero-energy grace period runs out.
// Checked every tick for the same reason sunPanicAngle is.
func (b *bot) energyPanicAngle(x, y, energy float32) (float64, bool) {
	const criticalEnergy = 40
	if energy > criticalEnergy || (x == 0 && y == 0) {
		return 0, false
	}
	inward := math.Atan2(float64(y), float64(x)) + math.Pi
	return inward + (b.rng.Float64()*2-1)*0.05, true
}

// dodgeAngle is a reflex, not a decision -- see its call site in inputLoop
// for why it's checked every tick alongside sunPanicAngle/energyPanicAngle
// instead of at the slower reaction-paced cadence.
//
// Triggered when the nearest player is close and Dashed is still set --
// meaning it burst forward recently and, since Dashed stays true for the
// whole post-dash cooldown (see backend/game/update.go), is very possibly
// still carrying that velocity right now -- and its current heading
// (Rotation, which tracks input direction, not a locked-on target) is aimed
// roughly at this bot. A dash's knockback is a straight burst in whatever
// direction the attacker was facing when it triggered, not homing, so
// stepping out of that line lets it sail past into empty space instead of
// connecting -- or, since the standard setup for a kill dash is attacking
// from further out than the target (see updateCombatPhase), on into the sun
// where this bot was standing, exactly like a player sidestepping to let an
// attacker's own momentum finish the job.
func (b *bot) dodgeAngle(x, y float32) (float64, bool) {
	b.mu.RLock()
	hasNearest := b.hasNearest
	tx, ty := b.nearestX, b.nearestY
	dist := b.nearestDist
	dashed := b.nearestDashed
	rotation := b.nearestRotation
	b.mu.RUnlock()

	// Roughly the distance a dash (DashForce 1200, decaying at KnockbackDecay
	// 3/s) can still cover during the remainder of its cooldown window --
	// outside this there's no realistic way the incoming burst still reaches
	// this bot, so there's nothing to dodge yet.
	const dodgeRange = 320
	if !hasNearest || !dashed || dist > dodgeRange || dist == 0 {
		return 0, false
	}

	// Is their current heading actually pointed at me, or are they dashing
	// past in some unrelated direction? Nothing to dodge if it's the latter.
	angleToMe := math.Atan2(float64(y-ty), float64(x-tx))
	headingError := normalizeAngle(float64(rotation) - angleToMe)
	const aimThreshold = 0.55 // ~31 degrees either side of dead-on
	if math.Abs(headingError) > aimThreshold {
		return 0, false
	}

	perp := float64(rotation) + b.orbitSign*math.Pi/2
	noise := (b.rng.Float64()*2 - 1) * 0.1
	return perp + noise, true
}

func (b *bot) chooseHumanTargetAngle() float64 {
	b.mu.RLock()
	x, y := b.x, b.y
	sunScale := b.sunScale
	phase := b.combatPhase
	tx, ty := b.targetX, b.targetY
	wx, wy := b.waypointX, b.waypointY
	b.mu.RUnlock()

	distFromCenter := math.Hypot(float64(x), float64(y))
	sunRadius := float64(sunScale) * sunStartRadius

	switch phase {
	case phaseEvade:
		return b.evadeAngle(x, y, tx, ty)
	case phasePosition:
		return b.positionAngle(x, y, wx, wy)
	case phaseStrike:
		return b.strikeAngle(x, y, tx, ty)
	default:
		return b.farmAngle(x, y, distFromCenter, sunRadius)
	}
}

// farmAngle orbits the sun at this bot's personal farmRadius (inside the gain
// zone), with a proportional pull back toward that radius so it holds station
// there instead of drifting -- the whole point being that a bot which doesn't
// actively hold a gain-zone radius barely earns any energy at all.
func (b *bot) farmAngle(x, y float32, distFromCenter, sunRadius float64) float64 {
	if x == 0 && y == 0 {
		return b.rng.Float64() * 2 * math.Pi
	}

	radial := math.Atan2(float64(y), float64(x))
	tangent := radial + b.orbitSign*math.Pi/2

	band := distFromCenter - sunRadius
	radialError := (band - b.farmRadius) / neutralEnergyDistance
	radialError = clampAbs(radialError, 1)
	absErr := math.Abs(radialError)

	// Gentle station-keeping near the target radius, but a real excursion
	// (e.g. dragged out of the gain zone by a chase) needs a much more direct
	// line home instead of still mostly orbiting -- shrink the tangential
	// component and sharpen the radial pull as the error grows.
	tangentWeight := 1.0 - absErr*0.7
	radialWeight := -radialError * (0.85 + absErr*0.7)

	desired := blendDirections(
		directionWeight{tangent, tangentWeight},
		directionWeight{radial, radialWeight},
	)
	noise := (b.rng.Float64()*2 - 1) * (0.12 + 0.25*b.personality.Impulsivity)
	return desired + noise
}

// evadeAngle runs from the threat while biasing away from the sun too, so
// retreating doesn't trade one danger for a worse one, plus a little
// tangential drift so it isn't a dead-straight, easy-to-intercept line.
func (b *bot) evadeAngle(x, y, tx, ty float32) float64 {
	awayFromThreat := math.Atan2(float64(y-ty), float64(x-tx))
	outward := math.Atan2(float64(y), float64(x))

	desired := blendDirections(
		directionWeight{awayFromThreat, 1.0},
		directionWeight{outward, 0.45},
		directionWeight{outward + b.orbitSign*math.Pi/2, 0.25},
	)
	noise := (b.rng.Float64()*2 - 1) * (0.05 + 0.18*(1-b.personality.TurnSkill))
	return desired + noise
}

// positionAngle heads for the flanking waypoint computed in updateCombatPhase.
func (b *bot) positionAngle(x, y, wx, wy float32) float64 {
	toWaypoint := math.Atan2(float64(wy-y), float64(wx-x))
	strafe := b.orbitSign * (0.08 + 0.2*(1-b.personality.Aggression))
	noise := (b.rng.Float64()*2 - 1) * (0.05 + 0.15*(1-b.personality.TurnSkill))
	return toWaypoint + strafe + noise
}

// strikeAngle is the kill run: aim straight at the target.
func (b *bot) strikeAngle(x, y, tx, ty float32) float64 {
	toTarget := math.Atan2(float64(ty-y), float64(tx-x))
	aimNoise := (b.rng.Float64()*2 - 1) * (0.03 + 0.08*(1-b.personality.TurnSkill))
	return toTarget + aimNoise
}

type directionWeight struct {
	angle  float64
	weight float64
}

// blendDirections combines directions as vectors (not by averaging angles,
// which breaks across the +-pi wraparound) and returns the resulting angle.
func blendDirections(weights ...directionWeight) float64 {
	var sx, sy float64
	for _, w := range weights {
		sx += math.Cos(w.angle) * w.weight
		sy += math.Sin(w.angle) * w.weight
	}
	if sx == 0 && sy == 0 {
		return 0
	}
	return math.Atan2(sy, sx)
}

// personalSunMargin is how far outside the sun's actual surface this bot
// starts to panic and override everything else to flee outward. Shared
// between the panic check and farmRadius (see bot creation in main) so a
// bot's own farming target can never land inside its own safety margin.
func personalSunMargin(cfg config, p personality) float64 {
	return cfg.ComfortMargin * (0.65 + 0.7*p.Caution)
}

func normalize(x, y float64) (float64, float64) {
	d := math.Hypot(x, y)
	if d == 0 {
		return 1, 0
	}
	return x / d, y / d
}

func clampAbs(v, limit float64) float64 {
	if v > limit {
		return limit
	}
	if v < -limit {
		return -limit
	}
	return v
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

// A blend of plain first names and the kind of short, lowercase handles
// people actually type into a name box (no adjective+noun+number template --
// that pattern is the single most obvious tell of a generated name).
// Deliberately inconsistent in style and capitalization, the same way a real
// player base is.
var botNames = []string{
	"Alex", "Jordan", "Sam", "Casey", "Riley", "Morgan", "Taylor", "Jamie",
	"Avery", "Quinn", "Skyler", "Reese", "Drew", "Kai", "Rowan", "Emerson",
	"Blake", "Charlie", "Finley", "Hayden", "Peyton", "Sage", "Micah", "Dakota",
	"Noah", "Liam", "Mia", "Zoe", "Leo", "Ivy", "Max", "Nina",
	"Theo", "Luca", "Elin", "Otto", "Nico", "Vera", "Iris", "Milo",
	"xX_shadow", "yeet", "lolzor", "sup", "gg", "noscope99", "idk", "ok",
	"jenny", "mike88", "sara_x", "tom", "kevin", "amy", "chris_", "dani",
	"guest1234", "player_one", "u2", "z", "bruh", "meep", "nova.", "ash",
}

func randomBotName(rng *rand.Rand) string {
	name := botNames[rng.Intn(len(botNames))]
	// Real players usually just type a bare name; only sometimes tack on a
	// number, as if the exact one they wanted was already taken -- always
	// appending one (the old adjective+noun+NNN scheme) is what made bot
	// names read as generated in the first place.
	if rng.Float64() < 0.3 {
		name = fmt.Sprintf("%s%d", name, 1+rng.Intn(99))
	}
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
