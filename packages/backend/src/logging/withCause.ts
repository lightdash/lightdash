export const withCause = <T extends Error>(error: T, cause: unknown): T =>
    Object.defineProperty(error, 'cause', { value: cause });
