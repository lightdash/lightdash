import {
    DbtModelNode,
    MetricFlowAggregation,
    MetricType,
    translateMetricFlowMetrics,
} from '@lightdash/common';
import { GraphQLClient } from 'graphql-request';
import {
    DbtCloudMetricNode,
    DbtCloudSemanticModelNode,
    DbtMetadataApiClient,
    mapDbtCloudMetrics,
    mapDbtCloudSemanticModels,
} from './DbtMetadataApiClient';

vi.mock('graphql-request');

const makeNode = (overrides: Record<string, unknown> = {}) => ({
    resourceType: 'model',
    accountId: '1',
    projectId: '1',
    environmentId: '1',
    uniqueId: 'model.project.pull_requests',
    name: 'pull_requests',
    description: '',
    meta: {},
    tags: [],
    filePath: 'models/pull_requests.sql',
    database: 'dbt_semantic_layer',
    schema: 'prod',
    alias: 'pull_requests',
    packageName: 'project',
    rawCode: 'SELECT 1',
    compiledCode: 'SELECT 1',
    materializedType: 'table',
    language: 'sql',
    packages: [],
    dbtVersion: '1.8.0',
    group: '',
    access: 'public',
    deprecationDate: '',
    version: '',
    latestVersion: '',
    releaseVersion: '',
    contractEnforced: false,
    patchPath: '',
    config: {},
    catalog: { columns: [] },
    ...overrides,
});

const makeApiResponse = (adapterType: string, nodes: unknown[]) => ({
    environment: {
        adapterType,
        applied: {
            lastUpdatedAt: '2026-01-01T00:00:00Z',
            models: {
                totalCount: nodes.length,
                pageInfo: {
                    startCursor: '0',
                    hasNextPage: false,
                    endCursor: '0',
                },
                edges: nodes.map((node) => ({ node })),
            },
        },
    },
});

const createClient = () =>
    new DbtMetadataApiClient({
        environmentId: '123',
        bearerToken: 'test-token',
        discoveryApiEndpoint: undefined,
        tags: undefined,
    });

describe('DbtMetadataApiClient', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('Snowflake identifier casing', () => {
        it('should uppercase database, schema, alias, and relation_name for Snowflake', async () => {
            const mockRequest = vi
                .fn()
                .mockResolvedValue(makeApiResponse('snowflake', [makeNode()]));
            (GraphQLClient as import('vitest').Mock).mockImplementation(
                // eslint-disable-next-line prefer-arrow-callback
                function MockGraphQLClient() {
                    return { request: mockRequest };
                },
            );

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.database).toBe('DBT_SEMANTIC_LAYER');
            expect(model.schema).toBe('PROD');
            expect(model.alias).toBe('PULL_REQUESTS');
            expect(model.relation_name).toBe(
                '"DBT_SEMANTIC_LAYER"."PROD"."PULL_REQUESTS"',
            );
        });

        it('should use model name when alias is empty for Snowflake', async () => {
            const mockRequest = vi
                .fn()
                .mockResolvedValue(
                    makeApiResponse('snowflake', [
                        makeNode({ alias: '', name: 'my_model' }),
                    ]),
                );
            (GraphQLClient as import('vitest').Mock).mockImplementation(
                // eslint-disable-next-line prefer-arrow-callback
                function MockGraphQLClient() {
                    return { request: mockRequest };
                },
            );

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.alias).toBe('MY_MODEL');
            expect(model.relation_name).toBe(
                '"DBT_SEMANTIC_LAYER"."PROD"."MY_MODEL"',
            );
        });
    });

    describe('non-Snowflake identifier casing', () => {
        it('should preserve original casing for Postgres', async () => {
            const mockRequest = vi
                .fn()
                .mockResolvedValue(makeApiResponse('postgres', [makeNode()]));
            (GraphQLClient as import('vitest').Mock).mockImplementation(
                // eslint-disable-next-line prefer-arrow-callback
                function MockGraphQLClient() {
                    return { request: mockRequest };
                },
            );

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.database).toBe('dbt_semantic_layer');
            expect(model.schema).toBe('prod');
            expect(model.alias).toBe('pull_requests');
            expect(model.relation_name).toBe(
                '"dbt_semantic_layer"."prod"."pull_requests"',
            );
        });

        it('should preserve original casing for BigQuery', async () => {
            const mockRequest = vi
                .fn()
                .mockResolvedValue(makeApiResponse('bigquery', [makeNode()]));
            (GraphQLClient as import('vitest').Mock).mockImplementation(
                // eslint-disable-next-line prefer-arrow-callback
                function MockGraphQLClient() {
                    return { request: mockRequest };
                },
            );

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.relation_name).toBe(
                '`dbt_semantic_layer`.`prod`.`pull_requests`',
            );
        });
    });
});

// Trimmed from a real Discovery API definition-state response
// (environment.definition.semanticModels / .metrics). The JSON scalars
// (`typeParams`, `filter`, `meta`) come back in the dbt manifest's snake_case
// shapes verbatim.
const semanticModelNodes: DbtCloudSemanticModelNode[] = [
    {
        uniqueId: 'semantic_model.metricflow_cloud_demo.orders',
        name: 'orders',
        description: 'Semantic model over the orders fact table (legacy spec).',
        entities: [
            { name: 'order', type: 'primary' },
            { name: 'customer', type: 'foreign' },
        ],
        dimensions: [
            { name: 'ordered_at', type: 'time' },
            { name: 'status', type: 'categorical' },
        ],
        measures: [
            {
                name: 'total_revenue',
                agg: 'sum',
                expr: 'amount',
                createMetric: false,
                description: 'Sum of order amounts',
            },
            {
                name: 'order_count',
                agg: 'count',
                expr: 'order_id',
                createMetric: false,
                description: null,
            },
        ],
        parents: [{ uniqueId: 'model.metricflow_cloud_demo.orders' }],
    },
];

const metricNodes: DbtCloudMetricNode[] = [
    {
        uniqueId: 'metric.metricflow_cloud_demo.total_revenue',
        name: 'total_revenue',
        description: 'Sum of all order amounts',
        label: 'Total revenue',
        type: 'simple',
        typeParams: {
            expr: null,
            measure: { name: 'total_revenue', alias: null, filter: null },
            metrics: [],
            numerator: null,
            denominator: null,
            metric_aggregation_params: null,
        },
        filter: null,
        meta: { group_label: 'Order Metrics' },
    },
    {
        uniqueId: 'metric.metricflow_cloud_demo.order_count',
        name: 'order_count',
        description: null,
        label: 'Order count',
        type: 'simple',
        typeParams: {
            expr: null,
            measure: { name: 'order_count', alias: null, filter: null },
            metrics: [],
            numerator: null,
            denominator: null,
            metric_aggregation_params: null,
        },
        filter: null,
        meta: null,
    },
    {
        uniqueId: 'metric.metricflow_cloud_demo.completed_revenue',
        name: 'completed_revenue',
        description: 'Revenue from completed orders only.',
        label: 'Completed revenue',
        type: 'simple',
        typeParams: {
            expr: null,
            measure: { name: 'total_revenue', alias: null, filter: null },
            metrics: [],
            numerator: null,
            denominator: null,
            metric_aggregation_params: null,
        },
        filter: {
            where_filters: [
                {
                    where_sql_template:
                        "{{ Dimension('order__status') }} = 'completed'\n",
                },
            ],
        },
        meta: null,
    },
    {
        uniqueId: 'metric.metricflow_cloud_demo.revenue_per_order',
        name: 'revenue_per_order',
        description: null,
        label: 'Revenue per order (ratio)',
        type: 'ratio',
        typeParams: {
            expr: null,
            measure: null,
            metrics: [],
            numerator: { name: 'total_revenue', alias: null, filter: null },
            denominator: { name: 'order_count', alias: null, filter: null },
            metric_aggregation_params: null,
        },
        filter: null,
        meta: null,
    },
    {
        uniqueId: 'metric.metricflow_cloud_demo.cumulative_revenue',
        name: 'cumulative_revenue',
        description: null,
        label: 'Cumulative revenue',
        type: 'cumulative',
        typeParams: {
            expr: null,
            measure: { name: 'total_revenue', alias: null, filter: null },
            metrics: [],
            numerator: null,
            denominator: null,
            cumulative_type_params: { period_agg: 'first' },
            metric_aggregation_params: null,
        },
        filter: null,
        meta: null,
    },
];

describe('mapDbtCloudSemanticModels', () => {
    it('maps Discovery API nodes to the manifest semantic_models shape', () => {
        const semanticModels = mapDbtCloudSemanticModels(semanticModelNodes);
        const orders =
            semanticModels['semantic_model.metricflow_cloud_demo.orders'];
        expect(orders).toMatchObject({
            name: 'orders',
            unique_id: 'semantic_model.metricflow_cloud_demo.orders',
            depends_on: { nodes: ['model.metricflow_cloud_demo.orders'] },
            entities: [
                { name: 'order', type: 'primary', expr: null },
                { name: 'customer', type: 'foreign', expr: null },
            ],
            dimensions: [
                { name: 'ordered_at', type: 'time', expr: null },
                { name: 'status', type: 'categorical', expr: null },
            ],
            measures: [
                {
                    name: 'total_revenue',
                    agg: MetricFlowAggregation.SUM,
                    expr: 'amount',
                },
                {
                    name: 'order_count',
                    agg: MetricFlowAggregation.COUNT,
                    expr: 'order_id',
                },
            ],
        });
    });

    it('keeps only model parents in depends_on', () => {
        const semanticModels = mapDbtCloudSemanticModels([
            {
                ...semanticModelNodes[0],
                parents: [
                    { uniqueId: 'seed.metricflow_cloud_demo.raw_orders' },
                    { uniqueId: 'model.metricflow_cloud_demo.orders' },
                ],
            },
        ]);
        expect(
            semanticModels['semantic_model.metricflow_cloud_demo.orders']
                .depends_on,
        ).toEqual({ nodes: ['model.metricflow_cloud_demo.orders'] });
    });
});

describe('mapDbtCloudMetrics', () => {
    it('maps Discovery API metric nodes to the manifest metrics shape', () => {
        const metrics = mapDbtCloudMetrics(metricNodes);
        expect(
            metrics['metric.metricflow_cloud_demo.total_revenue'],
        ).toMatchObject({
            name: 'total_revenue',
            type: 'simple',
            label: 'Total revenue',
            type_params: { measure: { name: 'total_revenue' } },
            filter: null,
            config: { meta: { group_label: 'Order Metrics' } },
        });
        expect(
            metrics['metric.metricflow_cloud_demo.completed_revenue'].filter,
        ).toEqual({
            where_filters: [
                {
                    where_sql_template:
                        "{{ Dimension('order__status') }} = 'completed'\n",
                },
            ],
        });
        expect(
            metrics['metric.metricflow_cloud_demo.completed_revenue'].config,
        ).toBeNull();
    });
});

describe('mapped definitions feed the MetricFlow translator', () => {
    it('translates supported metrics and skips unsupported ones', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: mapDbtCloudSemanticModels(semanticModelNodes),
            metrics: mapDbtCloudMetrics(metricNodes),
            modelNamesByUniqueId: {
                'model.metricflow_cloud_demo.orders': 'orders',
            },
        });

        expect(result.translatedCount).toBe(4);
        expect(result.skippedCount).toBe(1); // cumulative_revenue
        expect(result.metricsByModel.orders.total_revenue).toMatchObject({
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            label: 'Total revenue',
            group_label: 'Order Metrics',
        });
        // Filter compiled into the metric SQL against the dimension name
        expect(result.metricsByModel.orders.completed_revenue.sql).toBe(
            "CASE WHEN (${TABLE}.status = 'completed') THEN (${TABLE}.amount) END",
        );
        expect(result.metricsByModel.orders.revenue_per_order).toMatchObject({
            type: MetricType.NUMBER,
            sql: '(${total_revenue} * 1.0) / NULLIF(${order_count}, 0)',
        });
        expect(result.warnings).toEqual([
            'Skipped MetricFlow metric "cumulative_revenue": metric type "cumulative" is not supported yet.',
        ]);
    });
});
