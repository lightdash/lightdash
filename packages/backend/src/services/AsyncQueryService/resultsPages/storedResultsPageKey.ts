import { createHash } from 'crypto';
import type { ResultsPageFormatInputs } from './buildResultsPageRows';

const compareKeys = ([a]: [string, unknown], [b]: [string, unknown]) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
};

const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(compareKeys)
        .map(
            ([key, entry]) =>
                `${JSON.stringify(key)}:${stableStringify(entry)}`,
        );
    return `{${entries.join(',')}}`;
};

export const getResultsPageFormatHash = ({
    fields,
    pivotValuesColumns,
    timezone,
}: ResultsPageFormatInputs): string =>
    createHash('sha256')
        .update(
            stableStringify({
                fields,
                pivotValuesColumns: pivotValuesColumns ?? null,
                timezone: timezone ?? null,
            }),
        )
        .digest('hex');

export const getStoredResultsPageKey = ({
    resultsFileName,
    appVersion,
    format,
    pageSize,
    page,
}: {
    resultsFileName: string;
    appVersion: string;
    format: ResultsPageFormatInputs;
    pageSize: number;
    page: number;
}): string =>
    `${resultsFileName}.pages/${appVersion}/${getResultsPageFormatHash(
        format,
    )}/${pageSize}/${page}.json.br`;
