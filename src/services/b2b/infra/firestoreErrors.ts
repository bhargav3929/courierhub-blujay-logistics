// firebase-admin throws errors with a `code` property. The exact value
// varies by surface (numeric gRPC code vs string), so we accept both.

const ALREADY_EXISTS_CODES: ReadonlyArray<unknown> = [
    6,                  // gRPC code for ALREADY_EXISTS
    'already-exists',
    'ALREADY_EXISTS',
];

const NOT_FOUND_CODES: ReadonlyArray<unknown> = [
    5,                  // gRPC code for NOT_FOUND
    'not-found',
    'NOT_FOUND',
];

function readCode(err: unknown): unknown {
    if (err === null || typeof err !== 'object') return undefined;
    return (err as { code?: unknown }).code;
}

export function isAlreadyExistsError(err: unknown): boolean {
    const code = readCode(err);
    return code !== undefined && ALREADY_EXISTS_CODES.includes(code);
}

export function isNotFoundError(err: unknown): boolean {
    const code = readCode(err);
    return code !== undefined && NOT_FOUND_CODES.includes(code);
}
