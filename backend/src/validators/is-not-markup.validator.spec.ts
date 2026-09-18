import { validate } from 'class-validator';
import { IsNotMarkup } from './is-not-markup.validator.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

class MarkupHolder {
  @IsNotMarkup()
  value?: unknown;
}

async function errorCodesFor(value: unknown): Promise<string[]> {
  const holder = new MarkupHolder();
  holder.value = value;
  const errors = await validate(holder);
  if (errors.length === 0) return [];
  const message = errors[0].constraints?.isNotMarkup;
  if (!message) return ['<no message>'];
  return (JSON.parse(message) as { code: string }[]).map((item) => item.code);
}

describe('IsNotMarkup', () => {
  it('accepts plain text with no angle brackets', async () => {
    expect(await errorCodesFor('Bleu de Chanel')).toEqual([]);
  });

  it('accepts an empty string', async () => {
    expect(await errorCodesFor('')).toEqual([]);
  });

  it('rejects a <script> tag', async () => {
    expect(await errorCodesFor('<script>alert(1)</script>')).toEqual([
      ValidationErrorCode.CONTAINS_MARKUP,
    ]);
  });

  it('rejects an <img onerror=...> tag', async () => {
    expect(await errorCodesFor('<img src=x onerror=alert(1)>')).toEqual([
      ValidationErrorCode.CONTAINS_MARKUP,
    ]);
  });

  it('rejects a lone "<" with no closing tag', async () => {
    expect(await errorCodesFor('5 < 3')).toEqual([
      ValidationErrorCode.CONTAINS_MARKUP,
    ]);
  });

  it('rejects a lone ">" with no opening tag', async () => {
    expect(await errorCodesFor('5 > 3')).toEqual([
      ValidationErrorCode.CONTAINS_MARKUP,
    ]);
  });

  it('ignores a non-string value, leaving it to a type validator', async () => {
    expect(await errorCodesFor(12345)).toEqual([]);
  });
});
