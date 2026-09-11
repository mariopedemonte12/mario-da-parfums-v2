# `passwords` — notes

- **`argon2id`** with `memoryCost: 19456` (~19 MB), `timeCost: 2`, `parallelism: 1` — the currently-recommended variant (resists both side-channel and GPU/ASIC attacks, unlike pure `argon2i`/`argon2d`), fixed options so no caller can accidentally weaken the hashing cost.
- **`verify()` catches any exception and returns `false`** instead of propagating — `argon2.verify` throws on a malformed/corrupt hash, and treating that as "doesn't match" (401) rather than letting it bubble into a 500 is the correct behavior for a login flow.
- No controller — this is an internal service other domains (`auths`) consume via `PasswordsModule`, per `backend/CLAUDE.md`'s rule that only this module calls `argon2` directly.
