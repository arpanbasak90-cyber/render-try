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

## Deployment & Render Database Setup

This project supports **Render** (`render.com`) for one-click hosting and managed database deployment.

### Option 1: Managed Render PostgreSQL (Recommended for Pure Render setup)
Set environment variables:
- `DB_MODE=postgres`
- `DATABASE_URL=postgresql://user:password@hostname:5432/jalraksha` (auto-populated by Render Blueprint)

### Option 2: MongoDB Atlas + Render Web Service
Host your FastAPI Web Service on Render and connect to a free MongoDB Atlas cluster:
- `DB_MODE=mongo`
- `MONGODB_URI=mongodb+sandbox...`

### Option 3: In-Memory / SQLite Mode (Development & Testing)
- `DB_MODE=memory` or `DB_MODE=sqlite`

### Deploying via Render Blueprint (`render.yaml`)
1. Connect your repository to Render.
2. Render will automatically detect [`render.yaml`](file:///c:/Users/lenovo/OneDrive/Desktop/New%20folder%20%282%29/rosmalai/render.yaml) and provision both the Web Service and Managed PostgreSQL database automatically.

## Safety

The four sensors measure only pH, TDS, turbidity, and temperature. They cannot detect fluoride, arsenic, iron, nitrate, or bacteria; the backend must not treat a sensor-only result as proof of potable water.

