export const formatToolJsonOutput = (value: unknown): string =>
    JSON.stringify(value, null, 2);
