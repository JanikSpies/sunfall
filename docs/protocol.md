# Protocol convention

1. All packets are binary.
2. Byte 0 is always PacketType.
3. The smallest field size is one byte.
4. No bit-packed fields.
5. Multibyte numbers use BigEndian.
6. Positions / energy / radii use float32.
7. Player IDs use uint16.

## Protocol allocation

| Packet           | Value |
| ---------------- | ----: |
| PacketPing       |     1 |
| PacketPong       |     2 |
| PacketConnected  |     3 |
| PacketInput      |     4 |
| PacketWorldState |     5 |
| PacketDeath      |     6 |
| PacketScoreboard |     7 |
| PacketMatchState |     9 |
| PacketMatchReset |    10 |
| PacketKill       |    11 |
