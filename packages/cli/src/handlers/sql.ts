import {
    ApiExecuteAsyncSqlQueryResults,
    ApiGetAsyncQueryResults,
    QueryHistoryStatus,
    ResultRow,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

type SqlHandlerOptions = {
    output: string;
    limit?: number;
    pageSize?: number;
    verbose?: boolean;
};

const DEFAULT_PAGE_SIZE = 500;
const POLL_INTERVAL_MS = 500;

/**
 * Convert ResultRow array to CSV string
 */
function resultsToCsv(columns: string[], rows: ResultRow[]): string {
    // Escape CSV value: wrap in quotes if contains comma, quote, or newline
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

/**
 * Fetch query results once
 */
async function fetchQueryResults(
    projectUuid: string,
    queryUuid: string,
    pageSize: number,
): Promise<ApiGetAsyncQueryResults> {
    const url = `/api/v2/projects/${projectUuid}/query/${queryUuid}?pageSize=${pageSize}`;
    return lightdashApi<ApiGetAsyncQueryResults>({
        method: 'GET',
        url,
        body: undefined,
    });
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Poll for query results until status is READY or ERROR
 */
async function pollQueryResults(
    projectUuid: string,
    queryUuid: string,
    pageSize: number,
): Promise<ApiGetAsyncQueryResults> {
    const poll = async (): Promise<ApiGetAsyncQueryResults> => {
        const result = await fetchQueryResults(
            projectUuid,
            queryUuid,
            pageSize,
        );
        GlobalState.debug(`> Query status: ${result.status}`);

        if (result.status === QueryHistoryStatus.READY) {
            return result;
        }

        if (result.status === QueryHistoryStatus.ERROR) {
            return result;
        }

        if (result.status === QueryHistoryStatus.CANCELLED) {
            throw new Error('Query was cancelled');
        }

        // Still pending, wait and poll again
        await sleep(POLL_INTERVAL_MS);
        return poll();
    };

    return poll();
}

export const sqlHandler = async (
    sql: string,
    options: SqlHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose ?? false);

    const config = await getConfig();
    const projectUuid = config.context?.project;

    if (!projectUuid) {
        throw new Error(
            `No project selected. Run 'lightdash config set-project' first.`,
        );
    }

    GlobalState.debug(`> Running SQL query against project: ${projectUuid}`);
    GlobalState.debug(`> SQL: ${sql}`);

    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

    // Submit the query
    const spinner = GlobalState.startSpinner('Submitting SQL query...');

    const submitResult = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        method: 'POST',
        url: `/api/v2/projects/${projectUuid}/query/sql`,
        body: JSON.stringify({
            sql,
            limit: options.limit,
            context: 'cli',
        }),
    });

    GlobalState.debug(`> Query UUID: ${submitResult.queryUuid}`);
    spinner.text = 'Waiting for query results...';

    // Poll for results
    const result = await pollQueryResults(
        projectUuid,
        submitResult.queryUuid,
        pageSize,
    );

    if (result.status === QueryHistoryStatus.ERROR) {
        spinner.fail('Query failed');
        throw new Error(result.error ?? 'Query execution failed');
    }

    if (result.status !== QueryHistoryStatus.READY) {
        spinner.fail('Unexpected query status');
        throw new Error(`Unexpected query status: ${result.status}`);
    }

    // Extract column names from the columns metadata
    const columns = Object.keys(result.columns);
    const rowCount = result.rows.length;

    spinner.text = `Writing ${rowCount} rows to ${options.output}...`;

    // Convert to CSV and write to file
    const csv = resultsToCsv(columns, result.rows);
    await fs.writeFile(options.output, csv, 'utf8');

    spinner.succeed(
        `${styles.success('Success!')} Wrote ${rowCount} rows to ${
            options.output
        }`,
    );
};
