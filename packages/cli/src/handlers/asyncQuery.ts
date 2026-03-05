import {
    ApiGetAsyncQueryResults,
    QueryHistoryStatus,
    ResultRow,
} from '@lightdash/common';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';

const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function pollForResults(
    projectUuid: string,
    queryUuid: string,
    options: { pageSize?: number; backoffMs?: number } = {},
): Promise<ApiGetAsyncQueryResults> {
    const { pageSize, backoffMs = INITIAL_BACKOFF_MS } = options;
    const pageSizeParam = pageSize ? `?pageSize=${pageSize}` : '';
    const result = await lightdashApi<ApiGetAsyncQueryResults>({
        method: 'GET',
        url: `/api/v2/projects/${projectUuid}/query/${queryUuid}${pageSizeParam}`,
        body: undefined,
    });

    GlobalState.debug(`> Query status: ${result.status}`);

    if (result.status === QueryHistoryStatus.PENDING) {
        await sleep(backoffMs);
        return pollForResults(projectUuid, queryUuid, {
            pageSize,
            backoffMs: Math.min(backoffMs * 2, MAX_BACKOFF_MS),
        });
    }

    return result;
}

export function resultsToCsv(columns: string[], rows: ResultRow[]): string {
    const escapeValue = (value: unknown): string => {
        if (value === null || value === undefined) {
            return '';
        }
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const header = columns.map(escapeValue).join(',');
    const dataRows = rows.map((row) =>
        columns.map((col) => escapeValue(row[col]?.value?.raw)).join(','),
    );

    return [header, ...dataRows].join('\n');
}
