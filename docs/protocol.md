# Protocol convention

1. All packets are binary.
2. Byte 0 is always PacketType.
3. The smallest field size is one byte.
4. No bit-packed fields.
5. Multibyte numbers use BigEndian.
6. Positions / energy / radii use float32.
7. Player IDs use uint16.
