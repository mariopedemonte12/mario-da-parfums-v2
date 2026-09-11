# `pipes` — notes

`customValidationPipe` is one of the two pieces of the global error-handling system — see `docs/error-handling.md` and `docs/validation-error-codes.md` for the full design. Implementation detail those docs don't spell out:

- `parseConstraintMessage` expects each `class-validator` constraint's `message` to be a JSON-serialized `{ code, meta? }` (produced by `src/validators/helpers/build-error-message.ts`). If `message` isn't valid JSON — a native `class-validator` decorator used without one of this project's wrappers (e.g. a bare `@IsEmail`) — it falls back to wrapping the raw message as `{ code: message }` rather than throwing. This is an escape hatch for un-migrated decorators, not the expected path: new DTOs should use the `src/validators/wrappers` that already emit JSON.
- `flattenErrors` walks `ValidationError[]` recursively (including `children` from `@ValidateNested`) to build dotted field paths (`address.street`) in the final `FieldError[]`.
