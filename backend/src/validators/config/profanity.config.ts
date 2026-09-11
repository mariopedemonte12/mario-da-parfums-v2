// validators/config/profanity.config.ts
import leoProfanity from 'leo-profanity';

// Carga el diccionario en español
leoProfanity.loadDictionary('es');
leoProfanity.loadDictionary('en');

export { leoProfanity };