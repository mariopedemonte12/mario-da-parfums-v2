import { registerDecorator, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from './helpers/build-error-message.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
const IMAGE_EXTENSION_PATTERN = new RegExp(
  `\\.(${ALLOWED_IMAGE_EXTENSIONS.join('|')})$`,
  'i',
);

function isImageUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  return IMAGE_EXTENSION_PATTERN.test(url.pathname);
}

// Solo valida forma (protocolo + extensión), sin red: confirmar que la URL
// realmente sirve una imagen queda a cargo de un job aparte, fuera de este
// backend, no de este validador síncrono de DTO.
export function IsImageUrl(
  code: ValidationErrorCode = ValidationErrorCode.IMAGE_URL_INVALID_FORMAT,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isImageUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isImageUrl(value);
        },
        defaultMessage() {
          return buildErrorMessage({
            code,
            meta: { allowedExtensions: ALLOWED_IMAGE_EXTENSIONS },
          });
        },
      },
    });
  };
}
