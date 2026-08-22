package game

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

type DeathReason uint8

const (
	DeathBySun       DeathReason = 1
	DeathByBlackHole DeathReason = 2
)

func BuildConnectedPacket(player *Player) []byte {
	buf := make([]byte, 11)

	buf[0] = PacketConnected

	binary.BigEndian.PutUint16(buf[1:3], player.ID)
	binary.BigEndian.PutUint32(buf[3:7], math.Float32bits(player.X))
	binary.BigEndian.PutUint32(buf[7:11], math.Float32bits(player.Y))

	return buf
}

func buildDeathPacket(reason DeathReason) []byte {
	return []byte{PacketDeath, byte(reason)}
}

func buildMatchStatePacket(world *Game) []byte {
	buf := make([]byte, 22)

	buf[0] = PacketMatchState
	buf[1] = byte(world.Phase)

	binary.BigEndian.PutUint32(
		buf[2:6],
		math.Float32bits(world.MatchTime),
	)

	binary.BigEndian.PutUint32(
		buf[6:10],
		math.Float32bits(world.Sun.X),
	)

	binary.BigEndian.PutUint32(
		buf[10:14],
		math.Float32bits(world.Sun.Y),
	)

	binary.BigEndian.PutUint32(
		buf[14:18],
		math.Float32bits(world.Sun.Radius),
	)

	binary.BigEndian.PutUint32(
		buf[18:22],
		math.Float32bits(world.Sun.BlackHoleRadius),
	)

	return buf
}

func buildMatchResetPacket() []byte {
	return []byte{PacketMatchReset}
}
