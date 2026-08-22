package main

import (
	"encoding/binary"
	"math"
)

const (
	PacketConnected  byte = 1
	PacketInput      byte = 2
	PacketWorldState byte = 3
	PacketDeath      byte = 4
	PacketDash       byte = 5
)

func buildConnectedPacket(player *Player) []byte {
	buf := make([]byte, 13)

	buf[0] = PacketConnected

	binary.BigEndian.PutUint32(
		buf[1:5],
		player.ID,
	)

	binary.BigEndian.PutUint32(
		buf[5:9],
		math.Float32bits(player.X),
	)

	binary.BigEndian.PutUint32(
		buf[9:13],
		math.Float32bits(player.Y),
	)

	return buf
}

func buildDeathPacket() []byte {
	return []byte{PacketDeath}
}
