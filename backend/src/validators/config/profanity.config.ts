// validators/config/profanity.config.ts
import leoProfanity from 'leo-profanity';
import { ES_PROFANITY_WORDS } from './es-profanity-words.js';

// leo-profanity@1.9.0 only ships an English word list — there is no `es`
// entry in its bundled dictionary/ folder, so loadDictionary('es') was
// silently falling back to English (its own getDictionary() defaults to
// 'en' for any unregistered name). Even if an 'es' dictionary did exist,
// loadDictionary() *replaces* the active word list rather than merging, so
// calling it once per language (as this used to) would always leave only
// the last language's words active regardless. Fix: load English as the
// base, then merge in a manually curated Spanish list additively via
// add() (not loadDictionary()).
leoProfanity.loadDictionary('en');
leoProfanity.add(ES_PROFANITY_WORDS);

export { leoProfanity };
