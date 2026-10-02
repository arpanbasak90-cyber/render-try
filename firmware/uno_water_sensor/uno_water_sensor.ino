#include <Arduino.h>

#define OUTPUT_PIN 13
#define SERIAL_BAUD 9600

const int PH_PIN = A0;
const int TURBIDITY_PIN = A1;
const int TDS_PIN = A2;
const int TEMP_PIN = A5;

const unsigned long DEFAULT_INTERVAL_MS = 1000;
unsigned long intervalMs = DEFAULT_INTERVAL_MS;
unsigned long lastEmit = 0;
bool sensing = false;

// pH Sensor (A0)
float readPh() {
  int raw = analogRead(PH_PIN);
  float voltage = raw * (5.0 / 1023.0);
  float ph = 3.5 * voltage; // Standard pH sensor conversion formula
  return (ph >= 0.0 && ph <= 14.0) ? ph : 7.0;
}

// TDS Sensor (A2)
float readTdsMgL() {
  int raw = analogRead(TDS_PIN);
  float voltage = raw * (5.0 / 1023.0);
  // Standard gravity TDS sensor conversion formula
  float tds = (133.42 * voltage * voltage * voltage - 255.86 * voltage * voltage + 857.39 * voltage) * 0.5;
  return (tds >= 0.0) ? tds : 0.0;
}

// Turbidity Sensor (A1)
float readTurbidityNtu() {
  int raw = analogRead(TURBIDITY_PIN);
  float voltage = raw * (5.0 / 1023.0);
  float turbidity = (4.5 - voltage) * 100.0;
  return (turbidity >= 0.0) ? turbidity : 0.0;
}

// Temperature Sensor (A5)
float readTemperatureC() {
  int raw = analogRead(TEMP_PIN);
  float voltage = raw * (5.0 / 1023.0);
  float tempC = voltage * 100.0; // LM35 sensor formula (or 25°C baseline)
  return (tempC >= -5.0 && tempC <= 80.0) ? tempC : 25.0;
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  pinMode(OUTPUT_PIN, OUTPUT);
  Serial.println(F("HELLO,uno_water_sensor,1,1"));
}

void loop() {
  if (Serial.available()) {
    char b[121];
    size_t n = Serial.readBytesUntil('\n', b, 120);
    b[n] = 0;

    if (!strncmp(b, "HELLO?", 6)) {
      Serial.println(F("HELLO,uno_water_sensor,1,1"));
    } else if (!strncmp(b, "START,", 6)) {
      intervalMs = atol(b + 6);
      sensing = true;
      Serial.println(F("ACK,START"));
      Serial.println(F("S,SENSING"));
    } else if (!strcmp(b, "STOP")) {
      sensing = false;
      Serial.println(F("ACK,STOP"));
      Serial.println(F("S,IDLE"));
    } else if (!strncmp(b, "FILTER_START,", 13)) {
      digitalWrite(OUTPUT_PIN, HIGH);
      Serial.println(F("ACK,FILTER_START"));
      Serial.println(F("S,FILTERING"));
    } else if (!strcmp(b, "FILTER_STOP")) {
      digitalWrite(OUTPUT_PIN, LOW);
      Serial.println(F("ACK,FILTER_STOP"));
      Serial.println(F("S,FILTER_DONE"));
    } else if (!strcmp(b, "PING")) {
      Serial.println(F("PONG"));
    }
  }

  static unsigned long seq = 0;
  if (sensing && millis() - lastEmit >= intervalMs) {
    lastEmit = millis();
    seq++;
    Serial.print(F("R,"));
    Serial.print(seq);
    Serial.print(',');
    Serial.print(readPh(), 2);
    Serial.print(',');
    Serial.print(readTdsMgL(), 1);
    Serial.print(',');
    Serial.print(readTurbidityNtu(), 1);
    Serial.print(',');
    Serial.println(readTemperatureC(), 1);
  }
}
