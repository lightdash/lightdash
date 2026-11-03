import {
    getErrorMessage,
    WarehouseQueryTimeoutError,
    type DimensionType,
    type QueryExecutionContext,
    type RunQueryTags,
    type WarehouseClient,
    type WarehouseResults,
} from '@lightdash/common';
import { SpanStatusCode } from '@opentelemetry/api';
import type Logger from '../../logging/logger';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { traceSpan } from '../../tracing/tracing';
import { applyLimitToSqlQuery } from '../../utils/QueryBuilder/utils';

export type ColumnDiscoveryMethod = 'limit_1';

export type ColumnDiscoveryOutcome = 'success' | 'empty' | 'error';

export type DiscoveredColumn = { name: string; type: DimensionType };

type ColumnDiscoveryArgs = {
    warehouseClient: WarehouseClient;
    sql: string;
    tags: RunQueryTags;
    projectUuid: string;
    context: QueryExecutionContext;
    logger: typeof Logger;
    prometheusMetrics: PrometheusMetrics | undefined;
};

const toColumns = (fields: WarehouseResults['fields']): DiscoveredColumn[] =>
    Object.entries(fields).map(([name, field]) => ({ name, type: field.type }));

// Span and metric carry no SQL or warehouse error text, so errors bypass traceSpan.
const observeDiscoveryCall = async (
    args: ColumnDiscoveryArgs,
    method: ColumnDiscoveryMethod,
    sentSql: string,
    discover: () => Promise<DiscoveredColumn[]>,
): Promise<DiscoveredColumn[]> => {
    const { warehouseClient, tags, projectUuid, context, logger } = args;
    const warehouseType = warehouseClient.credentials.type;
    const logFields = {
        projectUuid,
        method,
        warehouseType,
        sqlBytes: Buffer.byteLength(sentSql, 'utf8'),
        ...tags,
    };
    logger.info('column_discovery.started', {
        event: 'column_discovery.started',
        ...logFields,
    });
    const start = performance.now();
    const observeOutcome = (outcome: ColumnDiscoveryOutcome) => {
        const durationMs = performance.now() - start;
        args.prometheusMetrics?.observeColumnDiscovery({
            method,
            warehouseType,
            context,
            outcome,
            durationMs,
        });
        return durationMs;
    };

    const result = await traceSpan(
        {
            op: 'db.query',
            name: 'warehouse.discoverColumns',
            attributes: {
                'lightdash.columnDiscovery.method': method,
                'lightdash.warehouseType': warehouseType,
                'lightdash.queryContext': context,
            },
        },
        async (span) => {
            try {
                return { columns: await discover() };
            } catch (error) {
                span.setStatus({ code: SpanStatusCode.ERROR });
                return { error };
            }
        },
    );

    if ('error' in result) {
        const { error } = result;
        logger.error('column_discovery.failed', {
            event: 'column_discovery.failed',
            ...logFields,
            durationMs: observeOutcome('error'),
            errorName: error instanceof Error ? error.name : undefined,
            errorCode: (error as { code?: string })?.code,
            warehouseTimeout:
                error instanceof WarehouseQueryTimeoutError
                    ? error.data
                    : undefined,
            errorMessage: getErrorMessage(error),
        });
        throw error;
    }
    const { columns } = result;
    logger.info('column_discovery.completed', {
        event: 'column_discovery.completed',
        ...logFields,
        durationMs: observeOutcome(columns.length > 0 ? 'success' : 'empty'),
        columnCount: columns.length,
    });
    return columns;
};

const discoverWithLimitOne = (args: ColumnDiscoveryArgs) => {
    const limitedSql = applyLimitToSqlQuery({ sqlQuery: args.sql, limit: 1 });
    return observeDiscoveryCall(args, 'limit_1', limitedSql, async () => {
        let columns: DiscoveredColumn[] = [];
        await args.warehouseClient.streamQuery(
            limitedSql,
            (chunk) => {
                if (columns.length === 0 && chunk.fields) {
                    columns = toColumns(chunk.fields);
                }
            },
            { tags: args.tags },
        );
        return columns;
    });
};

export const discoverColumns = (
    args: ColumnDiscoveryArgs,
): Promise<DiscoveredColumn[]> => discoverWithLimitOne(args);
