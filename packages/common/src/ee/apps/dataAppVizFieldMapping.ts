/** Normalize one binding for consumers that handle either cardinality. */
export const getDataAppVizFieldIds = (
    value: string | string[] | undefined,
): string[] =>
    typeof value === 'string' ? [value] : [...new Set(value ?? [])];
