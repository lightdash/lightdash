import {
    ApiCompiledQueryResults,
    ApiExecuteAsyncMetricQueryResults,
    QueryHistoryStatus,
    type Explore,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { pollForResults, resultsToCsv } from './asyncQuery';
import { lightdashApi } from './dbt/apiClient';

type MetricQueryOptions = {
    explore: string;
    metrics: string[];
    dimensions: string[];
    sort?: string[];
    limit?: number;
    output?: string;
    sql?: boolean;
    pageSize?: number;
    verbose?: boolean;
};

const DEFAULT_LIMIT = 500;
const DEFAULT_PAGE_SIZE = 500;

function qualifyFieldId(
    fieldId: string,
    baseTable: string,
    tableNames: Set<string>,
): string {
    for (const table of tableNames) {
        if (fieldId.startsWith(`${table}_`)) {
            return fieldId;
        }
    }
    return `${baseTable}_${fieldId}`;
}

function parseSorts(
    sorts: string[] | undefined,
    baseTable: string,
    tableNames: Set<string>,
): { fieldId: string; descending: boolean }[] {
    if (!sorts || sorts.length === 0) return [];

    return sorts.map((sort) => {
        const lastColon = sort.lastIndexOf(':');
        let rawFieldId: string;
        let descending = false;
        if (lastColon === -1) {
            rawFieldId = sort;
        } else {
            const direction = sort.substring(lastColon + 1).toLowerCase();
            if (direction === 'desc') {
                rawFieldId = sort.substring(0, lastColon);
                descending = true;
            } else if (direction === 'asc') {
                rawFieldId = sort.substring(0, lastColon);
            } else {
                rawFieldId = sort;
            }
        }
        return {
            fieldId: qualifyFieldId(rawFieldId, baseTable, tableNames),
            descending,
        };
    });
}

async function fetchExplore(
    projectUuid: string,
    exploreName: string,
): Promise<Explore> {
    return lightdashApi<Explore>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/explores/${exploreName}`,
        body: undefined,
    });
}

export const metricQueryHandler = async (
    options: MetricQueryOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose ?? false);

    const config = await getConfig();
    const projectUuid = config.context?.project;
    if (!projectUuid) {
        throw new Error(
            `No project selected. Run 'lightdash config set-project' first.`,
        );
    }

    const spinner = GlobalState.startSpinner(
        `Fetching explore '${options.explore}'...`,
    );

    const explore = await fetchExplore(projectUuid, options.explore);
    const { baseTable } = explore;
    const tableNames = new Set(Object.keys(explore.tables));

    GlobalState.debug(`> Base table: ${baseTable}`);
    GlobalState.debug(`> Tables: ${[...tableNames].join(', ')}`);

    const metrics = options.metrics.map((m) =>
        qualifyFieldId(m, baseTable, tableNames),
    );
    const dimensions = options.dimensions.map((d) =>
        qualifyFieldId(d, baseTable, tableNames),
    );
    const sorts = parseSorts(options.sort, baseTable, tableNames);
    const limit = options.limit ?? DEFAULT_LIMIT;

    GlobalState.debug(`> Metrics: ${metrics.join(', ')}`);
    GlobalState.debug(`> Dimensions: ${dimensions.join(', ')}`);
    GlobalState.debug(`> Sorts: ${JSON.stringify(sorts)}`);
    GlobalState.debug(`> Limit: ${limit}`);

    if (options.sql) {
        spinner.text = 'Compiling metric query...';

        const result = await lightdashApi<ApiCompiledQueryResults>({
            method: 'POST',
            url: `/api/v1/projects/${projectUuid}/explores/${options.explore}/compileQuery`,
            body: JSON.stringify({
                exploreName: options.explore,
                dimensions,
                metrics,
                filters: {},
                sorts,
                limit,
                tableCalculations: [],
            }),
        });

        spinner.stop();

        if (options.output) {
            await fs.writeFile(options.output, result.query, 'utf8');
            GlobalState.log(
                `${styles.success('Success!')} Wrote compiled SQL to ${options.output}`,
            );
        } else {
            GlobalState.log(result.query);
        }
        return;
    }

    spinner.text = 'Executing metric query...';

    const queryBody = {
        exploreName: options.explore,
        dimensions,
        metrics,
        filters: {},
        sorts,
        limit,
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
    };

    const submitResult = await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        method: 'POST',
        url: `/api/v2/projects/${projectUuid}/query/metric-query`,
        body: JSON.stringify({
            query: queryBody,
            context: 'cli',
        }),
    });

    GlobalState.debug(`> Query UUID: ${submitResult.queryUuid}`);
    spinner.text = 'Waiting for query results...';

    const result = await pollForResults(projectUuid, submitResult.queryUuid, {
        pageSize: options.output
            ? (options.pageSize ?? DEFAULT_PAGE_SIZE)
            : undefined,
    });

    if (result.status === QueryHistoryStatus.ERROR) {
        spinner.fail('Query failed');
        throw new Error(result.error ?? 'Query execution failed');
    }

    if (result.status === QueryHistoryStatus.CANCELLED) {
        spinner.fail('Query cancelled');
        throw new Error('Query was cancelled');
    }

    if (result.status !== QueryHistoryStatus.READY) {
        spinner.fail('Unexpected query status');
        throw new Error(`Unexpected query status: ${result.status}`);
    }

    const durationMs = result.metadata.performance.initialQueryExecutionMs;
    const durationStr = durationMs ? ` (${durationMs}ms)` : '';

    if (options.output) {
        const columns = Object.keys(result.columns);
        const csv = resultsToCsv(columns, result.rows);
        await fs.writeFile(options.output, csv, 'utf8');
        spinner.succeed(
            `${styles.success('Success!')} Wrote ${result.rows.length} rows to ${options.output}${durationStr}`,
        );
    } else {
        const columns = Object.keys(result.columns);
        const csv = resultsToCsv(columns, result.rows);
        spinner.stop();
        GlobalState.log(csv);
    }
};
