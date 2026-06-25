export type ToolOutputFormat = 'xml' | 'json';

export const stringifyToolJson = (value: unknown) => JSON.stringify(value);
