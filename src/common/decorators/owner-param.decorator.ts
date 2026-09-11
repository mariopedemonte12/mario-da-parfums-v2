import { SetMetadata } from '@nestjs/common';

export const OWNER_PARAM_KEY = 'ownerParam';

/**
 * Nombre del route param que identifica al dueño del recurso (ej. "userId").
 * Usar solo cuando difiere del default de ResourceOwnerGuard, que es "id".
 */
export const OwnerParam = (paramName: string) => SetMetadata(OWNER_PARAM_KEY, paramName);
