import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    type AiSemanticChartArtifactConfig,
    type Explore,
} from '@lightdash/common';
import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import { describeChart, findStaleChartMetadata } from './chartTitle';

const explore = {
    name: 'work_orders',
    label: 'Work orders',
    baseTable: 'work_orders',
    tables: {
        work_orders: {
            label: 'Work orders',
            dimensions: {
                request_month: {
                    name: 'request_month',
                    table: 'work_orders',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    label: 'Request month',
                },
                priority: {
                    name: 'priority',
                    table: 'work_orders',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    label: 'Priority',
                },
            },
            metrics: {
                count: {
                    name: 'count',
                    table: 'work_orders',
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                    label: 'Work order count',
                },
            },
        },
    },
} as unknown as Explore;

const artifact: AiSemanticChartArtifactConfig = {
    source: 'semantic',
    config: {
        title: 'Work orders per month in 2024',
        description: 'Monthly work orders in 2024',
        queryConfig: {
            exploreName: 'work_orders',
            dimensions: ['work_orders_request_month'],
            metrics: ['work_orders_count'],
            sorts: [],
            limit: 100,
            parameters: null,
            customMetrics: null,
            tableCalculations: null,
            filters: {
                type: 'and',
                dimensions: [
                    {
                        fieldId: 'work_orders_priority',
                        fieldType: DimensionType.STRING,
                        fieldFilterType: FilterType.STRING,
                        operator: FilterOperator.EQUALS,
                        values: ['High'],
                    },
                ],
                metrics: null,
                tableCalculations: null,
            },
        },
        chartConfig: null,
    },
};

const current = {
    title: 'Work orders per month in 2024',
    description: 'Monthly work orders in 2024',
};

const answers = (
    titleAccurate: number,
    descriptionAccurate: number,
): DecisionAnswers => ({
    titleAccurate: { type: 'noul', noul: titleAccurate },
    descriptionAccurate: { type: 'noul', noul: descriptionAccurate },
});

describe('chart title staleness', () => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    const { summary, generatorContext } = describeChart(artifact, explore);
    afterEach(() => vi.restoreAllMocks());

    it('describes the chart with field labels and existing filter labels', () => {
        expect(summary).toEqual({
            measures: ['Work order count'],
            breakdowns: ['Request month'],
            filters: ['Priority is High'],
        });
        expect(generatorContext).toMatchObject({
            tableName: 'Work orders',
            chartType: 'table',
            metrics: ['work_orders_count'],
            dimensions: ['work_orders_request_month'],
        });
        expect(generatorContext.fieldsContext.map(({ name }) => name)).toEqual([
            'work_orders_count',
            'work_orders_request_month',
            'work_orders_priority',
        ]);
    });

    it.each([
        [
            'both still accurate',
            answers(0.9, 0.8),
            { title: false, description: false },
        ],
        [
            'a stale title',
            answers(0.1, 0.8),
            { title: true, description: false },
        ],
        ['both stale', answers(0.2, 0.3), { title: true, description: true }],
    ])('reports %s', async (_, response, expected) => {
        vi.spyOn(decisions, 'evaluate').mockResolvedValue(response);
        expect(
            await findStaleChartMetadata({
                decisions,
                request: 'only high priority ones',
                current,
                summary,
            }),
        ).toEqual(expected);
    });

    it('never marks a missing description stale', async () => {
        vi.spyOn(decisions, 'evaluate').mockResolvedValue(answers(0.1, 0.1));
        expect(
            await findStaleChartMetadata({
                decisions,
                request: 'only high priority ones',
                current: { ...current, description: null },
                summary,
            }),
        ).toEqual({ title: true, description: false });
    });

    it.each([
        ['returns nothing', () => Promise.resolve(null)],
        ['fails', () => Promise.reject(new Error('down'))],
    ])('keeps the current metadata when Jev %s', async (_, evaluate) => {
        vi.spyOn(decisions, 'evaluate').mockImplementation(evaluate);
        expect(
            await findStaleChartMetadata({
                decisions,
                request: 'only high priority ones',
                current,
                summary,
            }),
        ).toBeNull();
    });
});
