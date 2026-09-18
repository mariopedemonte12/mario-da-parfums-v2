import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { parseConstraintMessage } from '../../validators/helpers/parse-constraint-message.js';
import { findNulPaths } from '../../validators/helpers/find-nul-paths.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { errorResult } from './tool-result.js';

function flattenCodes(errors: ValidationError[]): string[] {
  return errors.flatMap((err) => {
    const own = err.constraints
      ? Object.values(err.constraints)
          .flatMap(parseConstraintMessage)
          .map((item) => item.code)
      : [];
    const nested = err.children ? flattenCodes(err.children) : [];
    return [...own, ...nested];
  });
}

// Runs the same class-validator DTOs the REST controllers use, standalone
// (validate()) rather than through Nest's ValidationPipe — the MCP
// transport never goes through Nest's HTTP layer, so this is the only way
// to apply a DTO's own rules (maxLength, formats, business rules like
// profanity) to MCP input the same way HTTP's ValidationPipe does. See
// mcp/NOTES.md.
export async function validateDtoInput<T extends object>(
  cls: new () => T,
  args: unknown,
): Promise<{ ok: true; value: T } | { ok: false; result: CallToolResult }> {
  if (findNulPaths(args).length > 0) {
    return {
      ok: false,
      result: errorResult(
        `Invalid input: ${ValidationErrorCode.CONTAINS_NUL_CHARACTER}`,
      ),
    };
  }
  const instance = plainToInstance(cls, args);
  const errors = await validate(instance);
  if (errors.length === 0) {
    return { ok: true, value: instance };
  }
  return {
    ok: false,
    result: errorResult(`Invalid input: ${flattenCodes(errors).join(', ')}`),
  };
}
