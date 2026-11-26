import { formatRow } from '@lightdash/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import type { ResultsPageFormatInputs } from './buildResultsPageRows';

export type ResultsPageHostFormat = {
    locale: string;
    timeZone: string;
    formatterRevision: string;
};

const readFormatterSource = (): string => {
    try {
        return readFileSync(
            path.join(
                path.dirname(require.resolve('@lightdash/common')),
                'utils',
                'formatting.js',
            ),
            'utf8',
        );
    } catch {
        return String(formatRow);
    }
};

let formatterRevision: string | undefined;

const getFormatterRevision = (): string => {
    formatterRevision ??= createHash('sha256')
        .update(readFormatterSource())
        .digest('hex')
        .slice(0, 16);
    return formatterRevision;
};

export const getResultsPageHostFormat = (): ResultsPageHostFormat => ({
    locale: new Intl.NumberFormat().resolvedOptions().locale,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    formatterRevision: getFormatterRevision(),
});

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

export const getResultsPageFormatHash = (
    { fields, pivotValuesColumns, timezone }: ResultsPageFormatInputs,
    host: ResultsPageHostFormat = getResultsPageHostFormat(),
): string =>
    createHash('sha256')
        .update(
            stableStringify({
                fields,
                pivotValuesColumns: pivotValuesColumns ?? null,
                timezone: timezone ?? null,
                host,
            }),
        )
        .digest('hex');

export const getStoredResultsPageKey = ({
    resultsFileName,
    appVersion,
    format,
    pageSize,
    page,
    host,
}: {
    resultsFileName: string;
    appVersion: string;
    format: ResultsPageFormatInputs;
    pageSize: number;
    page: number;
    host?: ResultsPageHostFormat;
}): string =>
    `${resultsFileName}.pages/${appVersion}/${getResultsPageFormatHash(
        format,
        host,
    )}/${pageSize}/${page}.json.br`;
