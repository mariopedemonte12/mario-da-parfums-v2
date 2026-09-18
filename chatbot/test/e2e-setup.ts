import '../src/load-env.js';

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    'GEMINI_API_KEY no está configurada en el archivo de entorno de la raíz del repo (ni en el entorno) — requerida para los tests e2e contra Gemini real.',
  );
}
