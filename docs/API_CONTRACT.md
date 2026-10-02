# API contract

Implemented now: `GET /api/v1/health`, `GET /api/v1/meta/options`, `GET /api/v1/meta/states`, `GET /api/v1/meta/states/{state_code}/districts`, `POST /api/v1/auth/google`, and authenticated `POST /api/v1/auth/region`.

The frontend intentionally requests dashboard records only after Google authentication and region selection. `POST /api/v1/auth/region` currently validates the hand-off but returns `persisted: false`; add a user/profile persistence repository before treating a region as durable across devices. The intended dashboard order is meta -> validate -> start -> stream -> complete -> filtering -> history. Unimplemented endpoint groups must not be treated as available.
