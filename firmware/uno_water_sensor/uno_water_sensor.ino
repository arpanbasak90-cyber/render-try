#include <Arduino.h>
#define OUTPUT_PIN 13 // USER-FILL: replace with the required filter output pin.
#define SERIAL_BAUD 9600
const unsigned long DEFAULT_INTERVAL_MS=1000;
unsigned long intervalMs=DEFAULT_INTERVAL_MS,lastEmit=0; bool sensing=false;
float readPh(){ return NAN; } // USER-FILL: supply sensor-specific reading and calibration.
float readTdsMgL(){ return NAN; } // USER-FILL: supply sensor-specific reading and calibration.
float readTurbidityNtu(){ return NAN; } // USER-FILL: supply sensor-specific reading and calibration.
float readTemperatureC(){ return NAN; } // USER-FILL: supply sensor-specific reading and calibration.
void setup(){ Serial.begin(SERIAL_BAUD); pinMode(OUTPUT_PIN,OUTPUT); Serial.println(F("HELLO,uno_water_sensor,1,1")); }
void loop(){
  if(Serial.available()){ char b[121]; size_t n=Serial.readBytesUntil('\n',b,120); b[n]=0;
    if(!strncmp(b,"HELLO?",6)){Serial.println(F("HELLO,uno_water_sensor,1,1"));}
    else if(!strncmp(b,"START,",6)){ intervalMs=atol(b+6); sensing=true; Serial.println(F("ACK,START")); Serial.println(F("S,SENSING"));}
    else if(!strcmp(b,"STOP")){sensing=false; Serial.println(F("ACK,STOP")); Serial.println(F("S,IDLE"));}
    else if(!strncmp(b,"FILTER_START,",13)){digitalWrite(OUTPUT_PIN,HIGH); Serial.println(F("ACK,FILTER_START")); Serial.println(F("S,FILTERING"));}
    else if(!strcmp(b,"FILTER_STOP")){digitalWrite(OUTPUT_PIN,LOW); Serial.println(F("ACK,FILTER_STOP")); Serial.println(F("S,FILTER_DONE"));}
    else if(!strcmp(b,"PING")) Serial.println(F("PONG"));
  }
  static unsigned long seq=0; if(sensing && millis()-lastEmit>=intervalMs){lastEmit=millis(); seq++; Serial.print(F("R,"));Serial.print(seq);Serial.print(',');Serial.print(readPh());Serial.print(',');Serial.print(readTdsMgL());Serial.print(',');Serial.print(readTurbidityNtu());Serial.print(',');Serial.println(readTemperatureC());}
}
