# API contract

Implemented now: `GET /api/v1/health`, `GET /api/v1/meta/options`, and `GET /api/v1/meta/states`. The intended dashboard order is meta -> validate -> start -> stream -> complete -> filtering -> history. Unimplemented endpoint groups must not be treated as available.
