# `features/layout` — notes

- **`Navbar`'s logged-in avatar is initials-only, not a photo.** There is no
  S3 base-URL/key-to-image resolution anywhere in this codebase yet — the
  backend only validates `photoS3Key`'s shape
  (`backend/src/users/dto/update-user.dto.ts`), nothing serves or exposes it
  as a URL. Building a photo avatar now would mean inventing that
  infrastructure unreviewed; revisit once it exists (see
  `specs/auth-pages.md`, "Navbar reflects session state").
- **"Salir" replaces "Entrar" directly in the same slot — no dropdown.** An
  earlier version used an avatar-triggered dropdown menu; the user
  explicitly asked for "Salir" to just take "Entrar"'s place instead, so
  that was simplified away (no open/close state, no click-outside/`Escape`
  handling to maintain). Only exists on the desktop nav. The mobile
  hamburger menu's carousel (`MOBILE_NAV_ITEMS`) is a static href-only list
  with no concept of an action item, so it wasn't reworked to offer logout
  — the mobile top-bar circle does switch to initials so it isn't visibly
  wrong when logged in, but there's currently no way to log out from a
  phone. Known gap, not a bug.
- **`NavLink`'s wind-gust hover effect was extracted to
  `features/common/components/WindGustLink.tsx`** once `features/auth`'s
  `AuthTabs` needed the same motif for its active-tab indicator — see that
  file's header comment for the `.nav-link`/`.nav-gust` CSS contract
  (`globals.css`) and the `isActive` variant it adds. It also now accepts
  `onClick` instead of `href` (renders a `<button>` instead of a `Link`) so
  Navbar's "Salir" can reuse the exact same underline treatment as "Entrar".
