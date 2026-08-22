package game

import (
	"encoding/binary"
	"math"
)

const (
	PacketPing        byte = 1
	PacketPong        byte = 2
	PacketConnected   byte = 3
	PacketInput       byte = 4
	PacketWorldState  byte = 5
	PacketDeath       byte = 6
	PacketWorldConfig byte = 7
	PacketRadar       byte = 8
	PacketMatchState  byte = 9
	PacketMatchReset  byte = 10
)

type DeathReason uint8

const (
	DeathBySun             DeathReason = 1
	DeathByBlackHole       DeathReason = 2
	DeathByEnergyDepletion DeathReason = 3
)

func buildConnectedPacket(player *Player) []byte {
	buf := make([]byte, 15)

	buf[0] = PacketConnected

	binary.BigEndian.PutUint16(buf[1:3], player.ID)
	binary.BigEndian.PutUint32(buf[3:7], math.Float32bits(player.X))
	binary.BigEndian.PutUint32(buf[7:11], math.Float32bits(player.Y))
	binary.BigEndian.PutUint32(buf[11:15], math.Float32bits(player.Rotation))

	return buf
}

func buildWorldConfigPacket() []byte {
	buf := make([]byte, 13)
	buf[0] = PacketWorldConfig

	binary.BigEndian.PutUint32(buf[1:5], math.Float32bits(VisibilityChunkSize))
	binary.BigEndian.PutUint32(buf[5:9], WorldSeed)
	binary.BigEndian.PutUint32(buf[9:13], math.Float32bits(VisibilityRadius))

	return buf
}

func buildWorldStatePacket(snapshot *VisibilitySnapshot, indexes []int) []byte {
	buf := make([]byte, 3+(len(indexes)*20))
	buf[0] = PacketWorldState
	binary.BigEndian.PutUint16(buf[1:3], uint16(len(indexes)))

	offset := 3

	for _, index := range indexes {
		player := snapshot.Players[index]

		binary.BigEndian.PutUint16(buf[offset:offset+2], player.ID)
		offset += 2

		binary.BigEndian.PutUint32(buf[offset:offset+4], math.Float32bits(player.X))
		offset += 4

		binary.BigEndian.PutUint32(buf[offset:offset+4], math.Float32bits(player.Y))
		offset += 4

		binary.BigEndian.PutUint32(buf[offset:offset+4], math.Float32bits(player.Rotation))
		offset += 4

		binary.BigEndian.PutUint32(buf[offset:offset+4], math.Float32bits(player.Energy))
		offset += 4

		buf[offset] = player.SizeLevel
		offset++

		if player.DashAvailable {
			buf[offset] = 1
		}
		offset++
	}

	return buf
}

func buildDeathPacket(reason DeathReason) []byte {
	return []byte{PacketDeath, byte(reason)}
}

func buildMatchStatePacket(world *Game) []byte {
	buf := make([]byte, 10)

	buf[0] = PacketMatchState
	buf[1] = byte(world.Phase)

	binary.BigEndian.PutUint32(
		buf[2:6],
		math.Float32bits(world.MatchTime),
	)

	binary.BigEndian.PutUint32(
		buf[6:10],
		math.Float32bits(world.Sun.Radius),
	)

	return buf
}

func buildMatchResetPacket() []byte {
	return []byte{PacketMatchReset}
}

func ParseInputPacket(data []byte) (inputX int8, inputY int8, dash bool, ok bool) {
	if len(data) != 4 {
		return 0, 0, false, false
	}

	inputX = int8(data[1])
	inputY = int8(data[2])

	if inputX == -128 {
		inputX = -127
	}

	if inputY == -128 {
		inputY = -127
	}

	if data[3] > 1 {
		return 0, 0, false, false
	}

	dash = data[3] == 1

	return inputX, inputY, dash, true
}
