import { validate } from 'class-validator';
import { IsImageUrl } from './is-image-url.validator.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

class ImageUrlHolder {
  @IsImageUrl()
  value?: unknown;
}

async function errorCodesFor(value: unknown): Promise<string[]> {
  const holder = new ImageUrlHolder();
  holder.value = value;
  const errors = await validate(holder);
  if (errors.length === 0) return [];
  const message = errors[0].constraints?.isImageUrl;
  if (!message) return ['<no message>'];
  return (JSON.parse(message) as { code: string }[]).map((item) => item.code);
}

describe('IsImageUrl', () => {
  // Spec: "la URL debe ser una URL http(s) bien formada y con extensión de
  // imagen (.jpg, .jpeg, .png, .webp, .gif, .avif, con o sin query string
  // después)". Only shape is validated, per spec/fragrances-crud.md.

  it('accepts a well-formed https URL with an allowed extension', async () => {
    expect(await errorCodesFor('https://example.com/images/a.jpg')).toEqual([]);
  });

  it('accepts a well-formed http URL with an allowed extension', async () => {
    expect(await errorCodesFor('http://example.com/images/a.png')).toEqual([]);
  });

  it.each([['jpeg'], ['webp'], ['gif'], ['avif']])(
    'accepts the %s extension listed in the spec',
    async (ext) => {
      expect(await errorCodesFor(`https://example.com/a.${ext}`)).toEqual([]);
    },
  );

  it('accepts a query string after the extension, per spec', async () => {
    expect(
      await errorCodesFor('https://example.com/a.jpg?w=200&h=100'),
    ).toEqual([]);
  });

  it('rejects a non-string value', async () => {
    expect(await errorCodesFor(12345)).toEqual([
      ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
    ]);
  });

  it('rejects a string that is not a parseable URL', async () => {
    expect(await errorCodesFor('not a url')).toEqual([
      ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
    ]);
  });

  it('rejects a non-http(s) protocol', async () => {
    expect(await errorCodesFor('ftp://example.com/a.jpg')).toEqual([
      ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
    ]);
  });

  it('rejects an http(s) URL with no extension', async () => {
    expect(await errorCodesFor('https://example.com/a')).toEqual([
      ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
    ]);
  });

  it('rejects an http(s) URL with a disallowed extension', async () => {
    expect(await errorCodesFor('https://example.com/a.pdf')).toEqual([
      ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
    ]);
  });

  it('rejects a URL where the allowed extension is present but not at the end of the path', async () => {
    expect(await errorCodesFor('https://example.com/malware.jpg.exe')).toEqual([
      ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
    ]);
  });

  it('rejects an empty string (not treated as absent, unlike undefined/null)', async () => {
    expect(await errorCodesFor('')).toEqual([
      ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
    ]);
  });
});
