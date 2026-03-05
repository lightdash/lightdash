import {
    ApiExecuteAsyncSqlQueryResults,
    getErrorMessage,
    QueryHistoryStatus,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { categorizeError, LightdashAnalytics } from '../analytics/analytics';
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
const DEFAULT_LIMIT = 50000;

export const sqlHandler = async (
    sql: string,
    options: SqlHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose ?? false);

    const executionId = uuidv4();
    const startTime = Date.now();

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

    try {
        await LightdashAnalytics.track({
            event: 'sql.started',
            properties: {
                executionId,
                projectId: projectUuid,
            },
        });

        const spinner = GlobalState.startSpinner('Submitting SQL query...');

        const limit = options.limit ?? DEFAULT_LIMIT;

        const submitResult = await lightdashApi<ApiExecuteAsyncSqlQueryResults>(
            {
                method: 'POST',
                url: `/api/v2/projects/${projectUuid}/query/sql`,
                body: JSON.stringify({
                    sql,
                    limit,
                    context: 'cli',
                }),
            },
        );

        GlobalState.debug(`> Query UUID: ${submitResult.queryUuid}`);
        spinner.text = 'Waiting for query results...';

        const result = await pollForResults(
            projectUuid,
            submitResult.queryUuid,
            {
                pageSize,
            },
        );

        if (result.status === QueryHistoryStatus.ERROR) {
            spinner.fail('Query failed');
            throw new Error(result.error ?? 'Query execution failed');
        }

        if (result.status !== QueryHistoryStatus.READY) {
            spinner.fail('Unexpected query status');
            throw new Error(`Unexpected query status: ${result.status}`);
        }

        const columns = Object.keys(result.columns);
        const rowCount = result.rows.length;

        spinner.text = `Writing ${rowCount} rows to ${options.output}...`;

        const csv = resultsToCsv(columns, result.rows);
        await fs.writeFile(options.output, csv, 'utf8');

        spinner.succeed(
            `${styles.success('Success!')} Wrote ${rowCount} rows to ${
                options.output
            }`,
        );

        await LightdashAnalytics.track({
            event: 'sql.completed',
            properties: {
                executionId,
                projectId: projectUuid,
                rowCount,
                columnCount: columns.length,
                durationMs: Date.now() - startTime,
            },
        });
    } catch (e) {
        await LightdashAnalytics.track({
            event: 'sql.error',
            properties: {
                executionId,
                error: getErrorMessage(e),
                errorCategory: categorizeError(e),
            },
        });
        throw e;
    }
};
