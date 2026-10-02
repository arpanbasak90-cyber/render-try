# Device integration

The device workflow is now available through `GET /api/v1/devices`, `POST /api/v1/devices/connect`, `POST /api/v1/devices/disconnect`, `POST /api/v1/analysis/start`, `POST /api/v1/analysis/{id}/reading`, and `POST /api/v1/analysis/{id}/complete`. These routes require the authenticated bearer token.

The protocol is line-oriented ASCII and uses HELLO, R/RR, S, ACK/NAK, PING/PONG, and filter commands as specified by the product contract. The firmware is wiring-independent: all sensor readers and pin values are USER-FILL. Set `DEVICE_TRANSPORT=serial`, `SERIAL_PORT`, and matching baud after supplying hardware details. Remote or wireless options require a new Transport and are out of scope. Troubleshoot baud, port ownership, HELLO, and boot delay first.

The host's serial adapter is implemented in `app/services/transports/serial_transport.py`. See `docs/ESP32_SENSOR_WIRING.md` for the electrical safety rules, protocol examples, calibration requirements, and a starting ESP32 pin layout. The existing firmware still cannot produce scientifically valid readings until the exact sensor modules are selected and the four reader functions are implemented and calibrated.
