# JALRAKSHA backend

Backend-only FastAPI scaffold for the Smart Water Purification and Quality Monitoring System. It runs in memory with a simulator by default and keeps serial/MongoDB configuration paths explicit.

## Run

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
pytest
```

The current implementation exposes health and metadata endpoints and core protocol, stability, verdict, ID, and database primitives. Remaining API workflow modules are intentionally not represented as complete until implemented and tested.

## Assumptions

Engineering defaults such as serial baud 9600, boot delay 2 seconds, sensing interval, stability window, and minimum readings are assumptions rather than BIS requirements. Iron relaxation behavior is configurable. Hindi and Bengali messages need native review. Temperature is informational only. Simulated values are synthetic.

## Configuration

See `.env.example`; variables map directly to the prompt's configuration contract. `FILTER_DURATION_S` has no default and is required for timed filtering. `MONGODB_URI`, official LGD geography data, sensor conversion/calibration values, and serial port must be supplied by the integrator.

## Safety

The four sensors measure only pH, TDS, turbidity, and temperature. They cannot detect fluoride, arsenic, iron, nitrate, or bacteria; the backend must not treat a sensor-only result as proof of potable water.

## Deployment

Serial access works when the API runs directly on the USB-connected machine. Windows should run natively rather than in Docker. On Linux a compose `devices:` mapping can expose a serial device through an environment-provided path; this is untested. Remote/wireless links would require a new Transport and are out of scope.
