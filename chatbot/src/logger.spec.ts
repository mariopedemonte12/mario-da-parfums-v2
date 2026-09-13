import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './logger.js';

const ISO_TIMESTAMP = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('log', () => {
  it('info() prefixes the message with an ISO timestamp and the INFO level via console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('servidor listo');
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(ISO_TIMESTAMP);
    expect(line).toContain('INFO');
    expect(line).toContain('servidor listo');
  });

  it('warn() prefixes the message with an ISO timestamp and the WARN level via console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('cuidado');
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(ISO_TIMESTAMP);
    expect(line).toContain('WARN');
    expect(line).toContain('cuidado');
  });

  it('error() prefixes the message with an ISO timestamp and the ERROR level via console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('se rompió');
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(ISO_TIMESTAMP);
    expect(line).toContain('ERROR');
    expect(line).toContain('se rompió');
  });
});
