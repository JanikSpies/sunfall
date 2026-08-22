package game

import "sort"

type PlayerNetState struct {
	ID            uint16
	X             float32
	Y             float32
	Rotation      float32
	Energy        float32
	Radius        float32
	SizeLevel     uint8
	DashAvailable bool
	Dashed        bool
}

type VisibilitySnapshot struct {
	Tick    uint32
	Players []PlayerNetState
	ByID    map[uint16]int
	Chunks  map[CellCoord][]int
}

func newVisibilitySnapshot(tick uint32, players map[uint16]*Player) *VisibilitySnapshot {
	ids := make([]int, 0, len(players))

	for id, player := range players {
		if player.Alive {
			ids = append(ids, int(id))
		}
	}

	sort.Ints(ids)

	snapshot := &VisibilitySnapshot{
		Tick:    tick,
		Players: make([]PlayerNetState, 0, len(ids)),
		ByID:    make(map[uint16]int, len(ids)),
		Chunks:  make(map[CellCoord][]int),
	}

	for _, rawID := range ids {
		player := players[uint16(rawID)]
		state := PlayerNetState{
			ID:            player.ID,
			X:             player.X,
			Y:             player.Y,
			Rotation:      player.Rotation,
			Energy:        player.Energy,
			Radius:        player.Radius,
			SizeLevel:     player.SizeLevel,
			DashAvailable: player.DashCooldown <= 0 && player.Energy >= DashEnergyCost,
			Dashed:        player.Dashed,
		}

		index := len(snapshot.Players)
		snapshot.Players = append(snapshot.Players, state)
		snapshot.ByID[state.ID] = index

		coord := cellCoord(state.X, state.Y, VisibilityChunkSize)
		snapshot.Chunks[coord] = append(snapshot.Chunks[coord], index)
	}

	return snapshot
}

func (snapshot *VisibilitySnapshot) QueryCircle(
	x, y, radius float32,
	destination []int,
) []int {
	destination = destination[:0]
	searchRadius := radius + MaxPlayerRadius
	minimum := cellCoord(x-searchRadius, y-searchRadius, VisibilityChunkSize)
	maximum := cellCoord(x+searchRadius, y+searchRadius, VisibilityChunkSize)

	for chunkY := minimum.Y; chunkY <= maximum.Y; chunkY++ {
		for chunkX := minimum.X; chunkX <= maximum.X; chunkX++ {
			for _, index := range snapshot.Chunks[CellCoord{X: chunkX, Y: chunkY}] {
				player := snapshot.Players[index]
				dx := player.X - x
				dy := player.Y - y
				visibleDistance := radius + player.Radius

				if dx*dx+dy*dy <= visibleDistance*visibleDistance {
					destination = append(destination, index)
				}
			}
		}
	}

	return destination
}
