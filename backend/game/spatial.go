package game

import "math"

type CellCoord struct {
	X int32
	Y int32
}

func cellCoord(x, y, cellSize float32) CellCoord {
	return CellCoord{
		X: int32(math.Floor(float64(x / cellSize))),
		Y: int32(math.Floor(float64(y / cellSize))),
	}
}
