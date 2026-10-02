# API contract

Implemented now: `GET /api/v1/health`, `GET /api/v1/meta/options`, `GET /api/v1/meta/states`, `GET /api/v1/meta/states/{state_code}/districts`, `POST /api/v1/auth/google`, and authenticated `POST /api/v1/auth/region`.

The frontend intentionally requests dashboard records only after Google authentication and region selection. `POST /api/v1/auth/region` currently validates the hand-off but returns `persisted: false`; add a user/profile persistence repository before treating a region as durable across devices.

Implemented device workflow routes: `GET /api/v1/devices`, `POST /api/v1/devices/connect`, `POST /api/v1/devices/disconnect`, `POST /api/v1/analysis/start`, `POST /api/v1/analysis/{session_id}/reading`, and `POST /api/v1/analysis/{session_id}/complete`. These use the configured simulator or serial transport and persist a completed non-synthetic sample when the database is available.

The intended dashboard order is meta -> validate -> start -> stream -> complete -> filtering -> history. Filtering, field-test entry, and region-scoped database queries remain unimplemented.
