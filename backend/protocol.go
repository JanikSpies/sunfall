package main

import (
	"encoding/binary"
	"math"
)

const (
	PacketConnected  byte = 1
	PacketInput      byte = 2
	PacketWorldState byte = 3
)

func buildConnectedPacket(player *Player) []byte {
	buf := make([]byte, 21)

	buf[0] = PacketConnected

	binary.BigEndian.PutUint32(
		buf[1:5],
		player.ID,
	)

	binary.BigEndian.PutUint64(
		buf[5:13],
		math.Float64bits(player.X),
	)

	binary.BigEndian.PutUint64(
		buf[13:21],
		math.Float64bits(player.Y),
	)

	return buf
}
