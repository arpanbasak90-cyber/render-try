# Device integration

The Uno protocol is line-oriented ASCII and uses HELLO, R/RR, S, ACK/NAK, PING/PONG, and filter commands as specified by the product contract. The firmware is wiring-independent: all sensor readers and pin values are USER-FILL. Set `DEVICE_TRANSPORT=serial`, `SERIAL_PORT`, and matching baud after supplying hardware details. Remote or wireless options require a new Transport and are out of scope. Troubleshoot baud, port ownership, HELLO, and boot delay first.
