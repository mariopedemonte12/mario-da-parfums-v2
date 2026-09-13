import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    'GEMINI_API_KEY no está configurada en chatbot/.env — requerida para los tests e2e contra Gemini real.',
  );
}
