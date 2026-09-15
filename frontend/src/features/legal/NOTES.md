# legal

- "Responsable del tratamiento" in `PrivacySection.tsx` is an intentional bracketed
  placeholder (`[Completar antes de publicar: ...]`), not an unfinished feature. Per
  `specs/legal-terms.md` §7, the entity/contact to declare there is a business decision for
  the project owner, not something to invent. Fill it in before this page is ever treated as
  production-ready legal copy.
- The Ley N° 21.719 mention deliberately avoids stating an entrada-en-vigor date. The spec
  flags that date as unconfirmed at spec-writing time and asks not to assert it without
  verifying — so the copy only says "escalonada" instead of naming a date.
- `/terminos` is a server component (no `"use client"`): the whole page is static text with
  native anchor links (`#terminos` / `#privacidad`), so no client-side state or interactivity
  is needed.
