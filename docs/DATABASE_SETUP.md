# Database setup

Use `DB_MODE=memory` for development. For MongoDB set `DB_MODE=mongo`, `MONGODB_URI`, `MONGODB_DB_NAME`, and timeout. Startup attempts a ping; unavailable MongoDB is reported by health rather than preventing process startup. Atlas `mongodb+srv` URIs are supported by Motor when supplied.

For real sign-in set `GOOGLE_CLIENT_ID` to the same web OAuth client configured in Google Cloud and set a long random `JWT_SECRET`. The current region endpoint validates an authenticated selection but does not persist it (`persisted: false`). To complete production wiring, add a users collection keyed by Google `sub`, a user-region preference collection/field, and repository methods for `POST /api/v1/auth/region`; also add bearer-token protection to sample/history endpoints when `AUTH_ENABLED` is true.
