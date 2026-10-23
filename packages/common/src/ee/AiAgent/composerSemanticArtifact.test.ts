import { FilterOperator, FilterType, UnitOfTime } from '../../types/filter';
import {
    QuerySourceType,
    type SemanticLayerSourceQuery,
} from '../../types/querySources';
import { toComposerSemanticArtifactVersion } from './composerSemanticArtifact';
import { type ComposerStoredChartVizConfig } from './schemas';
import { parseAiArtifactChartConfig, parseVizConfig } from './utils';

const node: SemanticLayerSourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_total_order_amount'],
    sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
    parameters: { 'orders.currency': 'EUR' },
    limit: 500,
};

const line: ComposerStoredChartVizConfig = {
    type: 'line',
    x: 'orders_order_date_month',
    y: ['orders_total_order_amount'],
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};

// Filters as the query tool resolves a node's filter expressions.
const filters: SemanticLayerSourceQuery['filters'] = {
    dimensions: {
        id: 'dims',
        and: [
            {
                id: 'status',
                target: {
                    fieldId: 'orders_status',
                    fieldFilterType: FilterType.STRING,
                },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
            },
            {
                id: 'date',
                target: {
                    fieldId: 'orders_order_date_month',
                    fieldFilterType: FilterType.DATE,
                },
                operator: FilterOperator.IN_THE_PAST,
                values: [3],
                settings: { completed: true, unitOfTime: UnitOfTime.months },
            },
        ],
    },
    metrics: {
        id: 'metrics',
        or: [
            {
                id: 'amount',
                target: {
                    fieldId: 'orders_total_order_amount',
                    fieldFilterType: FilterType.NUMBER,
                },
                operator: FilterOperator.GREATER_THAN,
                values: [100],
            },
            {
                id: 'missing',
                target: {
                    fieldId: 'orders_total_order_amount',
                    fieldFilterType: FilterType.NUMBER,
                },
                operator: FilterOperator.NULL,
                values: [],
            },
        ],
    },
} as SemanticLayerSourceQuery['filters'];

const present = (
    overrides: Partial<SemanticLayerSourceQuery> = {},
    vizConfig: ComposerStoredChartVizConfig = line,
) =>
    toComposerSemanticArtifactVersion({
        title: 'Revenue by month',
        description: null,
        node: { ...node, ...overrides },
        vizConfig,
        maxQueryLimit: 1000,
    });

const withoutIds = (value: unknown): unknown =>
    JSON.parse(
        JSON.stringify(value, (key, v) => (key === 'id' ? undefined : v)),
    );

describe('toComposerSemanticArtifactVersion', () => {
    it('replays as the same metric query through the classic artifact parser', () => {
        const version = present({ filters });

        const artifact = parseAiArtifactChartConfig(version?.vizConfig);
        if (artifact?.source !== 'semantic') throw new Error('not semantic');
        const replay = parseVizConfig(artifact.config, 1000);

        expect(replay?.metricQuery).toMatchObject({
            exploreName: 'orders',
            dimensions: ['orders_order_date_month', 'orders_status'],
            metrics: ['orders_total_order_amount'],
            sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
            limit: 500,
        });
        expect(replay?.parameters).toEqual({ 'orders.currency': 'EUR' });
        expect(withoutIds(replay?.metricQuery.filters)).toEqual({
            ...(withoutIds(filters) as object),
            tableCalculations: { and: [] },
        });
        expect(replay?.vizTool.chartConfig).toMatchObject({
            defaultVizType: 'line',
            lineType: null,
        });
    });

    it.each([
        [
            'nested filter groups',
            {
                filters: {
                    dimensions: { id: 'g', and: [{ id: 'n', or: [] }] },
                },
            },
        ],
        ['a limit above the classic maximum', { limit: 5000 }],
        [
            'table calculations',
            {
                tableCalculations: [
                    { name: 'tc', displayName: 'tc', sql: '1' },
                ],
            },
        ],
    ] as [string, Partial<SemanticLayerSourceQuery>][])(
        'is null for %s',
        (_, overrides) => {
            expect(present(overrides)).toBeNull();
        },
    );

    it('is null for a big number, which classic charts cannot draw', () => {
        expect(
            present({}, { ...line, type: 'big_number', x: null }),
        ).toBeNull();
    });

    it('is null for an area with a secondary axis, which classic charts stack', () => {
        expect(
            present({}, { ...line, type: 'area', y2: 'orders_count' }),
        ).toBeNull();
    });

    it('draws an area as a filled line and a horizontal bar as horizontal', () => {
        const area = present({}, { ...line, type: 'area' });
        const bar = present({}, { ...line, type: 'bar', horizontal: true });

        expect(area?.vizConfig.config.chartConfig).toMatchObject({
            defaultVizType: 'line',
            lineType: 'area',
        });
        expect(bar?.vizConfig.config.chartConfig).toMatchObject({
            defaultVizType: 'horizontal',
        });
    });
});
