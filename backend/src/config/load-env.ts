import { loadRootEnv } from './root-env.js';

// Side-effect module: import it FIRST so the repo-root env file is loaded
// before anything reads process.env. See specs/single-root-env.md.
loadRootEnv();
