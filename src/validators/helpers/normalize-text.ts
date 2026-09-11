

export function normalizeForProfanityCheck(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
        .replace(/[^a-z0-9\s]/g, '') // quita símbolos/puntuación
        .replace(/(.)\1{2,}/g, '$1$1') // reduce repeticiones ("hooolaaaa" -> "hoolaa")
        .replace(/\s+/g, ' ')
        .trim();
}