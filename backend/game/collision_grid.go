package game

var collisionNeighborOffsets = [...]CellCoord{
	{X: 1, Y: 0},
	{X: -1, Y: 1},
	{X: 0, Y: 1},
	{X: 1, Y: 1},
}

type CollisionGrid struct {
	buckets  map[CellCoord][]*Player
	occupied []CellCoord
}

func NewCollisionGrid() *CollisionGrid {
	return &CollisionGrid{
		buckets: make(map[CellCoord][]*Player),
	}
}

func (grid *CollisionGrid) Reset() {
	for _, coord := range grid.occupied {
		grid.buckets[coord] = grid.buckets[coord][:0]
	}

	grid.occupied = grid.occupied[:0]
}

func (grid *CollisionGrid) Insert(player *Player) {
	coord := cellCoord(player.X, player.Y, CollisionCellSize)
	bucket := grid.buckets[coord]

	if len(bucket) == 0 {
		grid.occupied = append(grid.occupied, coord)
	}

	grid.buckets[coord] = append(bucket, player)
}

func (grid *CollisionGrid) Rebuild(players map[uint16]*Player) {
	grid.Reset()

	for _, player := range players {
		if player.Alive {
			grid.Insert(player)
		}
	}
}

func (grid *CollisionGrid) ForEachCandidate(visit func(a, b *Player)) {
	for _, coord := range grid.occupied {
		bucket := grid.buckets[coord]

		for i := range bucket {
			for j := i + 1; j < len(bucket); j++ {
				visit(bucket[i], bucket[j])
			}
		}

		for _, offset := range collisionNeighborOffsets {
			neighbor := grid.buckets[CellCoord{
				X: coord.X + offset.X,
				Y: coord.Y + offset.Y,
			}]

			for _, a := range bucket {
				for _, b := range neighbor {
					visit(a, b)
				}
			}
		}
	}
}
