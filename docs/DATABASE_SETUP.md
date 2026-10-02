# Database setup

Use `DB_MODE=memory` for development. For MongoDB set `DB_MODE=mongo`, `MONGODB_URI`, `MONGODB_DB_NAME`, and timeout. Startup attempts a ping; unavailable MongoDB is reported by health rather than preventing process startup. Atlas `mongodb+srv` URIs are supported by Motor when supplied.
