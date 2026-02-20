import {
    ApiExecuteAsyncSqlQueryResults,
    QueryHistoryStatus,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { pollForResults, resultsToCsv } from './asyncQuery';
import { lightdashApi } from './dbt/apiClient';

type SqlHandlerOptions = {
    output: string;
    limit?: number;
    pageSize?: number;
    verbose?: boolean;
};

const DEFAULT_PAGE_SIZE = 500;

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
    const result = await pollForResults(projectUuid, submitResult.queryUuid, {
        pageSize,
    });

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
