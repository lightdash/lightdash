import {
    ApiExecuteAsyncMetricQueryResults,
    ChartAsCode,
    QueryHistoryStatus,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { pollForResults, resultsToCsv } from './asyncQuery';
import { lightdashApi } from './dbt/apiClient';

type RunChartOptions = {
    path: string;
    output?: string;
    limit?: number;
    pageSize?: number;
    verbose?: boolean;
};

const DEFAULT_PAGE_SIZE = 500;

export const runChartHandler = async (
    options: RunChartOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose ?? false);

    // Read and parse YAML
    let fileContent: string;
    try {
        fileContent = await fs.readFile(options.path, 'utf-8');
    } catch (err) {
        throw new Error(`Cannot read file: ${options.path}`);
    }

    let chart: unknown;
    try {
        chart = yaml.load(fileContent);
    } catch (err) {
        throw new Error(`Invalid YAML in ${options.path}`);
    }

    // Validate it's a metric query chart (not SQL)
    const typedChart = chart as Record<string, unknown>;
    if ('sql' in typedChart && !('tableName' in typedChart)) {
        throw new Error(
            'SQL charts are not supported. Only metric query charts (with tableName + metricQuery) can be run.',
        );
    }

    if (!typedChart.tableName || !typedChart.metricQuery) {
        throw new Error(
            `File is not a valid metric query chart. Expected 'tableName' and 'metricQuery' fields.`,
        );
    }

    const chartAsCode = chart as ChartAsCode;

    // Get project UUID
    const config = await getConfig();
    const projectUuid = config.context?.project;
    if (!projectUuid) {
        throw new Error(
            `No project selected. Run 'lightdash config set-project' first.`,
        );
    }

    const chartName = chartAsCode.name ?? chartAsCode.slug ?? options.path;
    GlobalState.debug(`> Running chart: ${chartName}`);
    GlobalState.debug(`> Table: ${chartAsCode.tableName}`);
    GlobalState.debug(`> Project: ${projectUuid}`);

    const spinner = GlobalState.startSpinner(
        `Executing query for '${chartName}'...`,
    );

    const { metricQuery } = chartAsCode;

    // Build request body: convert MetricQuery to MetricQueryRequest shape
    const queryBody = {
        exploreName: chartAsCode.tableName,
        dimensions: metricQuery.dimensions,
        metrics: metricQuery.metrics,
        filters: metricQuery.filters,
        sorts: metricQuery.sorts,
        limit: options.limit ?? metricQuery.limit,
        tableCalculations: metricQuery.tableCalculations,
        additionalMetrics: metricQuery.additionalMetrics,
        customDimensions: metricQuery.customDimensions,
    };

    // Submit metric query
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

    // Poll for completion
    const result = await pollForResults(projectUuid, submitResult.queryUuid, {
        pageSize: options.output
            ? (options.pageSize ?? DEFAULT_PAGE_SIZE)
            : undefined,
    });

    if (result.status === QueryHistoryStatus.ERROR) {
        spinner.fail(`Query failed for '${chartName}'`);
        throw new Error(result.error ?? 'Query execution failed');
    }

    if (result.status === QueryHistoryStatus.CANCELLED) {
        spinner.fail(`Query cancelled for '${chartName}'`);
        throw new Error('Query was cancelled');
    }

    if (result.status !== QueryHistoryStatus.READY) {
        spinner.fail('Unexpected query status');
        throw new Error(`Unexpected query status: ${result.status}`);
    }

    const durationMs = result.initialQueryExecutionMs;
    const durationStr = durationMs ? ` (${durationMs}ms)` : '';

    if (options.output) {
        const columns = Object.keys(result.columns);
        const csv = resultsToCsv(columns, result.rows);
        await fs.writeFile(options.output, csv, 'utf8');
        spinner.succeed(
            `${styles.success('Success!')} Wrote ${result.rows.length} rows to ${options.output}${durationStr}`,
        );
    } else {
        spinner.succeed(
            `${styles.success('Success!')} '${chartName}' query succeeded${durationStr}`,
        );
    }
};
