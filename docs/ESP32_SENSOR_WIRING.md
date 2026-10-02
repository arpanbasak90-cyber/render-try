# ESP32 sensor connection guide

The application now supports the existing line protocol over a serial port. It does **not** know which sensor board is attached: the pH, TDS/EC, turbidity, and temperature reader functions in `firmware/uno_water_sensor/uno_water_sensor.ino` are intentionally placeholders and must be calibrated for the exact modules you buy.

## Electrical rules

- ESP32 GPIO and ADC inputs are 3.3 V maximum. Never connect a 5 V sensor output directly to an ESP32 pin.
- Use a common ground between the ESP32 and every sensor/module.
- Power each module from the voltage specified by its datasheet. Do not assume a 5 V module is 3.3 V logic-safe.
- Add a voltage divider or a proper level shifter for any output above 3.3 V.
- Use a regulated supply with enough current; sensor heaters and pumps should not share an unstable USB rail.
- Keep analog sensor wires short and away from pump/motor wiring.

## Suggested ESP32 pin allocation

These are a starting layout, not a substitute for the module datasheets:

| Measurement | Interface | Suggested ESP32 connection |
|---|---|---|
| pH module | Analog voltage | ADC1 pin such as GPIO32 |
| TDS/EC module | Analog voltage | ADC1 pin such as GPIO33 |
| Turbidity module | Analog voltage | ADC1 pin such as GPIO34 |
| Temperature (for example DS18B20) | 1-Wire | GPIO4 with the module's required pull-up |
| Filter relay | Digital output | A GPIO driving a correctly rated relay/MOSFET module |
| USB serial | USB/UART | USB cable to the host running FastAPI |

Prefer ADC1 pins (GPIO32–GPIO39) when Wi-Fi may be enabled because ESP32 ADC2 pins can be unavailable while Wi-Fi is active. Confirm the exact board pinout before wiring.

## Firmware contract

The host sends:

```text
HELLO?
START,1000
STOP
PING
```

The board must answer with:

```text
HELLO,esp32_water_sensor,1,1
ACK,START
S,SENSING
R,1,7.12,240,0.42,24.6
```

The `R` fields are:

```text
R,sequence,pH,TDS_mg_per_L,turbidity_NTU,temperature_C
```

The current host configuration expects plain lines without checksums:

```env
DEVICE_TRANSPORT=serial
SERIAL_PORT=/dev/ttyUSB0       # Linux; Windows example: COM5
SERIAL_BAUD=9600
SERIAL_REQUIRE_CHECKSUM=false
```

The firmware currently uses `SERIAL_BAUD=9600`. Keep both sides identical.

## What must be calibrated before claiming real measurements

1. Replace `readPh`, `readTdsMgL`, and `readTurbidityNtu` with code for the exact sensor modules.
2. Add the temperature sensor driver and its required pull-up resistor.
3. Calibrate pH with standard buffer solutions, TDS/EC with a known standard, and turbidity with known reference samples.
4. Confirm ADC attenuation/reference behavior on the exact ESP32 board.
5. Return a finite number only when a sensor reading is valid; do not emit `nan` as a measurement.
6. Test the serial output in a terminal before connecting the web application.

The backend's **Devices** tab can connect, display the handshake, start an analysis, capture readings one at a time, and save a completed non-synthetic sample. It will report a timeout or connection error rather than fabricating values.

## Run sequence

1. Flash the board and open a serial monitor at 9600 baud.
2. Confirm the board prints `HELLO,esp32_water_sensor,1,1`.
3. Close the serial monitor so it releases the port.
4. Set `DEVICE_TRANSPORT=serial` and `SERIAL_PORT` in the backend `.env`.
5. Restart FastAPI.
6. Sign in, choose a region, open **Devices**, connect the board, then open **Analyse water**.
7. Start analysis, capture enough readings to represent a stable sample, and complete it.

Do not connect pumps, mains voltage, or high-current loads directly to an ESP32 GPIO. Use an isolated, appropriately rated driver and have the electrical design reviewed before field deployment.
