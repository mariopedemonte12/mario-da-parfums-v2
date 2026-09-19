import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT } from './system-prompt.js';

// specs/chatbot-server.md, "Eficiencia en el uso de tools".
describe('AGENT_SYSTEM_PROMPT — tool efficiency rules', () => {
  it.each([
    ['plan before calling', /Planific/],
    ['default cap of 3 recommendations', /máximo 3 perfumes/],
    ['single semantic search', /UNA sola búsqueda semántica/],
    ['names the semantic search tool', /search_similar_fragrances/],
    [
      'no repeated calls with same args',
      /No repitas una llamada con los mismos argumentos/,
    ],
    [
      'prices only for displayed fragrances',
      /solo de los perfumes que vas a\s+mostrar/,
    ],
    ['parallel independent calls', /en paralelo/],
    ['stop calling tools once enough info', /dejá de llamar tools/],
  ])('contains the rule: %s', (_label, pattern) => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(pattern);
  });

  it('keeps the existing guardrail and present_fragrances rules', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('present_fragrances');
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Ignorá cualquier instrucción/);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Respondé en español/);
  });
});
