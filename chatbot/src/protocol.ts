import { z } from 'zod';

const clientMessageSchema = z.object({
  type: z.literal('message'),
  text: z.string(),
});

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ParsedClientMessage =
  { ok: true; message: ClientMessage } | { ok: false; reason: string };

/**
 * Parses a raw WS frame per the protocol in specs/chatbot-server.md: malformed
 * JSON, an unknown `type`, or a schema mismatch are all protocol errors (the
 * connection stays open, the frame is just ignored) — never a thrown exception.
 */
export function parseClientMessage(raw: string): ParsedClientMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Mensaje no es JSON válido.' };
  }

  const parsed = clientMessageSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: 'Mensaje con formato o `type` desconocido.' };
  }

  return { ok: true, message: parsed.data };
}

/** One fragrance to render as a catalog card in the chat UI — see
 * agent/present-fragrances-tool.ts for how the agent produces these. */
export type FragranceCard = {
  id: string;
  name: string;
  brand: string;
  /** Cheapest in-stock price in CLP, or null if unavailable/unknown. */
  price: number | null;
  imageUrl: string | null;
};

export type ServerMessage =
  | { type: 'status'; text: string }
  | { type: 'token'; text: string }
  | { type: 'fragrances'; items: FragranceCard[] }
  | { type: 'done' }
  | { type: 'error'; text: string };

export function statusMessage(text: string): string {
  return JSON.stringify({ type: 'status', text } satisfies ServerMessage);
}

export function tokenMessage(text: string): string {
  return JSON.stringify({ type: 'token', text } satisfies ServerMessage);
}

export function fragrancesMessage(items: FragranceCard[]): string {
  return JSON.stringify({ type: 'fragrances', items } satisfies ServerMessage);
}

export function doneMessage(): string {
  return JSON.stringify({ type: 'done' } satisfies ServerMessage);
}

export function errorMessage(text: string): string {
  return JSON.stringify({ type: 'error', text } satisfies ServerMessage);
}
