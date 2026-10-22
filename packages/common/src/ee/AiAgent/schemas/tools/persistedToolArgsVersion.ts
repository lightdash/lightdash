// Args stored before version stamping carry no version: read them as V1.
export const defaultPersistedToolArgsVersion = (input: unknown): unknown =>
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    !('version' in input)
        ? { ...input, version: 1 }
        : input;
