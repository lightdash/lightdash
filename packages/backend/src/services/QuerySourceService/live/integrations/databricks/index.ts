import {
    ApiConnectorType,
    DATABRICKS_STATEMENTS_PATH,
    getDatabricksWarehousePath,
    isDatabricksWorkspaceOrigin,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { ALL_PUSHDOWN_REFUSED, defineLiveIntegration } from '../../integration';
import { compileDatabricksQuery } from './compile';
import {
    DATABRICKS_DATE_FILTERS,
    DATABRICKS_EXPLORES,
    DATABRICKS_FILTERS_BY_TYPE,
    DATABRICKS_METRIC_FILTERS,
} from './explores';
import {
    DATABRICKS_CALLS_PER_QUERY,
    DATABRICKS_MAX_QUERY_ROWS,
    parseDatabricksQuery,
    runDatabricksQuery,
    summarizeDatabricksTest,
    toDatabricksError,
} from './run';
import { DATABRICKS_SQL_BUILDER } from './sql';
import { databricksUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.DATABRICKS];
const LABEL = CATALOG.messageLabel;
const WAREHOUSE_ID = /^[A-Za-z0-9]{1,64}$/;

export const databricksIntegration = defineLiveIntegration({
    connector: ApiConnectorType.DATABRICKS,
    label: LABEL,
    settings: CATALOG.settings,
    origins: ['https://<your workspace>.cloud.databricks.com'],
    acceptsOrigin: isDatabricksWorkspaceOrigin,
    access: ({ warehouseId }) => ({
        pathPrefixes: [
            DATABRICKS_STATEMENTS_PATH,
            getDatabricksWarehousePath(warehouseId),
        ],
        // GET polls statements, reads result chunks and the setup test's warehouse
        methods: ['POST', 'GET'],
    }),
    // Databricks publishes no rate limit for statements; they queue on the
    // SQL warehouse, which the customer pays for while it runs.
    limits: {
        concurrentCalls: 5,
        callsPerMinute: 120,
        callsPerHour: 2_000,
        callsPerQuery: DATABRICKS_CALLS_PER_QUERY,
        // The submit call waits up to 50 seconds for a result
        timeoutMs: 60_000,
        maxRows: DATABRICKS_MAX_QUERY_ROWS,
    },
    // Databricks SQL takes any filter shape, and dates are ordinary filters.
    // Table calculations, custom fields and period over period compile into
    // the statement through the warehouse SQL builder.
    capabilities: {
        filters: {
            operators: {
                ...DATABRICKS_FILTERS_BY_TYPE,
                metric: DATABRICKS_METRIC_FILTERS,
            },
            multipleValues: true,
            or: true,
            nestedGroups: true,
        },
        metricFilters: true,
        dates: {
            rangeRequired: false,
            operators: DATABRICKS_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: {
            ...ALL_PUSHDOWN_REFUSED,
            tableCalculations: 'native',
            customDimensions: 'native',
            customMetrics: 'native',
            periodOverPeriod: 'native',
        },
    },
    explores: DATABRICKS_EXPLORES,
    plannedModelNames: ['clusters', 'warehouse_events', 'table_lineage'],
    level: {
        value: 5,
        description:
            'Databricks SQL runs on a SQL warehouse through the Statement Execution API, so Databricks totals everything itself.',
    },
    auth: {
        description:
            'No vendor review: a personal access token, or OAuth for a service principal. Reading system tables needs an account and metastore admin, or SELECT granted on the system catalog.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'no_review',
    },
    paging: {
        description:
            'Results come inline as JSON arrays in chunks, up to 25 MiB per statement; row_limit caps the rows. Statements past the wait timeout keep running and are polled by ID.',
    },
    rateLimits: {
        concurrentCalls: 5,
        callsPerSecond: null,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 120,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 2_000,
            },
        ],
        note: 'Databricks publishes no rate limit for the Statement Execution API; statements queue on the SQL warehouse instead.',
    },
    useCases: databricksUseCases,
    validate: ({ warehouseId }) => {
        if (!WAREHOUSE_ID.test(warehouseId)) {
            throw new ParameterError(
                'The Databricks SQL warehouse ID is the last part of its HTTP path, letters and digits only',
            );
        }
    },
    checkAuth: ({ type, origin, oauthTokenUrl }) => {
        if (type === 'oauth_client_credentials') {
            if (oauthTokenUrl !== new URL('/oidc/v1/token', origin).href) {
                throw new ParameterError(
                    "Databricks service principals must use the workspace's /oidc/v1/token endpoint",
                );
            }
            return;
        }
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Databricks integrations authenticate with a personal access token or a service principal',
            );
        }
    },
    describeTarget: ({ settings: { warehouseId }, origin, targetLabel }) =>
        `Databricks workspace ${new URL(origin).host}, SQL warehouse ${
            targetLabel ? `"${targetLabel}" (ID ${warehouseId})` : warehouseId
        }: system tables for billing, query history, job runs, audit events and tables`,
    parseRequest: parseDatabricksQuery,
    compile: ({ explore, metricQuery }) =>
        compileDatabricksQuery({ explore, metricQuery }),
    run: runDatabricksQuery,
    toError: toDatabricksError,
    summarizeTest: summarizeDatabricksTest,
    warehouseSqlBuilder: DATABRICKS_SQL_BUILDER,
});
