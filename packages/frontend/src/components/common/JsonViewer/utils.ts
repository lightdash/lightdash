export type JsonCellValue = Record<string, unknown> | unknown[];

export const getJsonCellValue = (value: unknown): JsonCellValue | undefined => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value !== null && typeof value === 'object') {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) return;

        return value as JsonCellValue;
    }
};

export const getJsonLikeString = (
    value: unknown,
): JsonCellValue | undefined => {
    if (typeof value !== 'string') return;

    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 1_000_000) return;

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];

    if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) {
        return;
    }

    try {
        return getJsonCellValue(JSON.parse(trimmed));
    } catch {
        return;
    }
};
