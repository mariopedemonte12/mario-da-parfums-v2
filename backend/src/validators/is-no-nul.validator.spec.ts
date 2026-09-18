import { validate } from 'class-validator';
import { IsNoNul } from './is-no-nul.validator.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

const NUL = String.fromCharCode(0);

class Holder {
  @IsNoNul()
  value?: unknown;
}

async function codesFor(value: unknown): Promise<string[]> {
  const holder = new Holder();
  holder.value = value;
  const errors = await validate(holder);
  if (errors.length === 0) return [];
  const message = errors[0].constraints?.isNoNul ?? '[]';
  return (JSON.parse(message) as { code: string }[]).map((i) => i.code);
}

describe('IsNoNul', () => {
  it('accepts plain text and the empty string', async () => {
    expect(await codesFor('Bleu de Chanel')).toEqual([]);
    expect(await codesFor('')).toEqual([]);
  });

  it('accepts other control characters (only NUL is rejected)', async () => {
    expect(await codesFor('a\tb\n')).toEqual([]);
  });

  it.each([`a${NUL}b`, NUL, `abc${NUL}`])(
    'rejects NUL in a value',
    async (v) => {
      expect(await codesFor(v)).toEqual([
        ValidationErrorCode.CONTAINS_NUL_CHARACTER,
      ]);
    },
  );

  it('passes non-strings through to the type validator', async () => {
    expect(await codesFor(undefined)).toEqual([]);
    expect(await codesFor(42)).toEqual([]);
  });
});
