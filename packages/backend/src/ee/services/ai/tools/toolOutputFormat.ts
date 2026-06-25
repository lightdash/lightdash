export type StructuredToolResult<TStructuredResult> = {
    result: string;
    structuredResult: TStructuredResult;
};

export const stringifyToolJson = (value: unknown) => JSON.stringify(value);
