import {
    ApiGetAsyncQueryResults,
    QueryHistoryStatus,
    ResultRow,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import { getAgentConnectionSelection } from '../credentials';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';

const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export const validateConnectionQueryUuid = (value: string): string => {
    if (getAgentConnectionSelection() !== null && !isUuid(value))
        throw new Error('The server returned an invalid query identifier.');
    return value;
};

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

    if (getAgentConnectionSelection() !== null) {
        if (!Object.values(QueryHistoryStatus).includes(result.status))
            throw new Error('The server returned an invalid query status.');
        if (result.status === QueryHistoryStatus.ERROR)
            throw new Error('Query execution failed.');
    }

    GlobalState.debug(`> Query status: ${result.status}`);

    if (
        result.status === QueryHistoryStatus.PENDING ||
        result.status === QueryHistoryStatus.QUEUED ||
        result.status === QueryHistoryStatus.EXECUTING
    ) {
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
