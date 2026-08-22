package main

import (
	"encoding/binary"
	"math"
)

const (
	PacketPing       byte = 1
	PacketPong       byte = 2
	PacketConnected  byte = 3
	PacketInput      byte = 4
	PacketWorldState byte = 5
	PacketDeath      byte = 6
	PacketRadar      byte = 8
	PacketMatchState byte = 9
	PacketMatchReset byte = 10
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

	// TODO: add direction
	// Change min size of an information to 1 byte for better js compatibility

	return buf
}

func buildDeathPacket() []byte {
	return []byte{PacketDeath}
}

func buildMatchStatePacket(game *Game) []byte {
	buf := make([]byte, 22)

	buf[0] = PacketMatchState
	buf[1] = byte(game.Phase)

	binary.BigEndian.PutUint32(
		buf[2:6],
		math.Float32bits(game.MatchTime),
	)

	binary.BigEndian.PutUint32(
		buf[6:10],
		math.Float32bits(game.Sun.X),
	)

	binary.BigEndian.PutUint32(
		buf[10:14],
		math.Float32bits(game.Sun.Y),
	)

	binary.BigEndian.PutUint32(
		buf[14:18],
		math.Float32bits(game.Sun.Radius),
	)

	binary.BigEndian.PutUint32(
		buf[18:22],
		math.Float32bits(game.Sun.BlackHoleRadius),
	)

	return buf
}

func buildMatchResetPacket() []byte {
	return []byte{PacketMatchReset}
}
