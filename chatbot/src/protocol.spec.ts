import { describe, expect, it } from 'vitest';
import {
  doneMessage,
  errorMessage,
  parseClientMessage,
  statusMessage,
  tokenMessage,
} from './protocol.js';

describe('parseClientMessage', () => {
  // Decision table: JSON validity x schema match (type === 'message' + text: string)
  it('accepts a well-formed message frame', () => {
    const result = parseClientMessage('{"type":"message","text":"hola"}');
    expect(result).toEqual({
      ok: true,
      message: { type: 'message', text: 'hola' },
    });
  });

  it('rejects raw text that is not JSON at all', () => {
    const result = parseClientMessage('not json');
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining('JSON'),
    });
  });

  it('rejects syntactically invalid JSON', () => {
    const result = parseClientMessage('{"type":"message",}');
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining('JSON'),
    });
  });

  it('rejects valid JSON with an unknown `type`', () => {
    const result = parseClientMessage('{"type":"ping","text":"hola"}');
    expect(result).toEqual({
      ok: false,
      reason: 'Mensaje con formato o `type` desconocido.',
    });
  });

  it('rejects a message missing `text`', () => {
    const result = parseClientMessage('{"type":"message"}');
    expect(result.ok).toBe(false);
  });

  it('rejects a message whose `text` is not a string', () => {
    const result = parseClientMessage('{"type":"message","text":42}');
    expect(result.ok).toBe(false);
  });

  it('rejects a JSON array (not an object) at the top level', () => {
    const result = parseClientMessage('[]');
    expect(result.ok).toBe(false);
  });

  // Per specs/chatbot-server.md, empty/whitespace-only text is rejected at
  // the protocol layer in websocket-server.ts (after trim), not by the
  // schema itself — parseClientMessage must still accept it as well-formed.
  it('accepts an empty-string `text` as schema-valid (trimming/rejection happens elsewhere)', () => {
    const result = parseClientMessage('{"type":"message","text":""}');
    expect(result).toEqual({
      ok: true,
      message: { type: 'message', text: '' },
    });
  });

  it('ignores unknown extra fields instead of rejecting the frame', () => {
    const result = parseClientMessage(
      '{"type":"message","text":"hola","extra":true}',
    );
    expect(result.ok).toBe(true);
  });
});

describe('server message builders', () => {
  it('builds a status frame', () => {
    expect(JSON.parse(statusMessage('buscando...'))).toEqual({
      type: 'status',
      text: 'buscando...',
    });
  });

  it('builds a token frame', () => {
    expect(JSON.parse(tokenMessage('hola'))).toEqual({
      type: 'token',
      text: 'hola',
    });
  });

  it('builds a done frame with no text field', () => {
    expect(JSON.parse(doneMessage())).toEqual({ type: 'done' });
  });

  it('builds an error frame', () => {
    expect(JSON.parse(errorMessage('boom'))).toEqual({
      type: 'error',
      text: 'boom',
    });
  });
});
