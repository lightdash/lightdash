import { stringify } from 'csv-stringify/sync';

// Keeps cells distinguishable for the model: booleans print as true/false,
// null stays blank, and an empty string is quoted ("").
export const stringifyAgentCsv = (
    rows: unknown[][],
    columns: string[],
): string =>
    stringify(rows, {
        header: true,
        columns,
        cast: { boolean: (value) => (value ? 'true' : 'false') },
        quoted_match: /^$/,
    });
