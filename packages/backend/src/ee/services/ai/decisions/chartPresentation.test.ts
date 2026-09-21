import {
    DimensionType,
    toolRunQueryArgsSchemaTransformed,
    type Explore,
    type ToolRunQueryBuiltinChartConfig,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import {
    getChartResultShape,
    resolveChartPresentation,
} from './chartPresentation';

const explore: Explore = structuredClone(validExplore);
explore.tables.a.dimensions.dim1.type = DimensionType.DATE;
explore.tables.a.dimensions.dim1.label = 'Order date';
explore.tables.b.dimensions.dim1.label = 'Region';
const query = toolRunQueryArgsSchemaTransformed.parse({
    title: 'Sales',
    description: 'Revenue by month and region',
    chartConfig: null,
    queryConfig: {
        exploreName: explore.name,
        dimensions: ['a_dim1', 'b_dim1'],
        metrics: ['a_met1'],
        sorts: [],
        limit: 100,
        filters: null,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
    },
});
const rows = [
    { a_dim1: '2026-01-01', b_dim1: 'EMEA', a_met1: '10.5' },
    { a_dim1: '2026-01-01', b_dim1: 'AMER', a_met1: '20' },
    { a_dim1: '2026-02-01', b_dim1: 'EMEA', a_met1: '30' },
];
const choice = (value: string) => ({
    type: 'choice' as const,
    choice: value,
    confidence: 0.99,
    probabilities: { [value]: 1 },
});
const noul = (value: number) => ({ type: 'noul' as const, noul: value });
const createDecisions = (overrides: Partial<DecisionAnswers> = {}) => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    const evaluate = vi
        .spyOn(decisions, 'evaluate')
        .mockImplementation(async ({ questions }) =>
            Object.fromEntries(
                Object.entries(questions).map(([key, question]) => {
                    if (overrides[key]) return [key, overrides[key]];
                    if (question.type === 'choice')
                        return [
                            key,
                            choice(key === 'type' ? 'line' : 'a_dim1'),
                        ];
                    if (question.type === 'score')
                        return [
                            key,
                            { type: 'score', score: 3, confidence: 0.99 },
                        ];
                    return [
                        key,
                        noul(
                            key.startsWith('metric_') ||
                                key.startsWith('group_')
                                ? 0.99
                                : 0.01,
                        ),
                    ];
                }),
            ),
        );
    return { decisions, evaluate };
};
const existing: ToolRunQueryBuiltinChartConfig = {
    defaultVizType: 'bar',
    xAxisDimension: 'a_dim1',
    yAxisMetrics: ['a_met1'],
    groupBy: ['b_dim1'],
    xAxisType: 'time',
    stackBars: false,
    lineType: null,
    xAxisLabel: 'My dates',
    yAxisLabel: 'My revenue',
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
};

describe('chart defaults from query results', () => {
    it('assembles valid temporal axes and series without changing the query', async () => {
        const before = structuredClone(query);
        const { decisions, evaluate } = createDecisions();
        const result = await resolveChartPresentation({
            decisions,
            question: 'Revenue over time by region',
            query,
            explore,
            rows,
        });
        expect(result.config).toMatchObject({
            defaultVizType: 'line',
            xAxisDimension: 'a_dim1',
            yAxisMetrics: ['a_met1'],
            groupBy: ['b_dim1'],
            xAxisType: 'time',
            xAxisLabel: 'Order date',
            lineType: 'line',
        });
        expect(result.config?.groupBy).not.toContain('a_dim1');
        expect(query).toEqual(before);
        expect(evaluate).toHaveBeenCalledTimes(1);
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            rowCount: 3,
            dimensions: [
                { id: 'a_dim1', cardinality: 2, seriesCardinality: 2 },
                { id: 'b_dim1', cardinality: 2 },
            ],
        });
        expect(JSON.stringify(evaluate.mock.calls[0][0].state)).not.toContain(
            'EMEA',
        );
    });

    it('uses a table when there is no chart axis', async () => {
        const { decisions } = createDecisions({
            type: choice('table'),
            x: choice('none'),
        });
        const result = await resolveChartPresentation({
            decisions,
            question: 'Total revenue',
            query: {
                ...query,
                queryConfig: { ...query.queryConfig, dimensions: [] },
            },
            explore,
            rows,
        });
        expect(result.config).toMatchObject({
            defaultVizType: 'table',
            xAxisDimension: null,
            yAxisMetrics: null,
            groupBy: null,
        });
    });

    it.each([
        { x: choice('invented') },
        { type: choice('none') },
        { type: { ...choice('line'), confidence: 0.4 } },
    ])(
        'uses a complete default for unknown axes or uncertain style decisions: %j',
        async (overrides) => {
            const { decisions } = createDecisions(overrides);
            expect(
                (
                    await resolveChartPresentation({
                        decisions,
                        question: 'Revenue by month and region',
                        query,
                        explore,
                        rows,
                    })
                ).config,
            ).toMatchObject({
                xAxisDimension: 'a_dim1',
                yAxisMetrics: ['a_met1'],
                groupBy: ['b_dim1'],
            });
        },
    );

    it('counts combined series and rejects a default with too many of them', async () => {
        const many = Array.from({ length: 16 }, (_, i) => ({
            a_dim1: '2026-01-01',
            b_dim1: `r${i % 4}`,
            extra: `x${Math.floor(i / 4)}`,
            a_met1: 1,
        }));
        const multi = {
            ...query,
            queryConfig: {
                ...query.queryConfig,
                dimensions: [...query.queryConfig.dimensions, 'extra'],
            },
        };
        const { decisions } = createDecisions();
        expect(
            getChartResultShape(multi, explore, many).dimensions[0]
                .seriesCardinality,
        ).toBe(16);
        expect(
            (
                await resolveChartPresentation({
                    decisions,
                    question: 'Revenue by month and both categories',
                    query: multi,
                    explore,
                    rows: many,
                })
            ).config,
        ).toMatchObject({ defaultVizType: 'table' });
    });

    it('excludes pies with negative values or more than six categories', async () => {
        const single = {
            ...query,
            queryConfig: { ...query.queryConfig, dimensions: ['b_dim1'] },
        };
        const { decisions, evaluate } = createDecisions({
            type: choice('pie'),
            x: choice('b_dim1'),
        });
        const result = await resolveChartPresentation({
            decisions,
            question: 'Compare regions',
            query: single,
            explore,
            rows: [{ b_dim1: 'one', a_met1: -10 }],
        });
        expect(evaluate.mock.calls[0][0].questions.type).not.toHaveProperty(
            'criteria.pie',
        );
        expect(result.config?.defaultVizType).not.toBe('pie');
        await resolveChartPresentation({
            decisions,
            question: 'Compare regions',
            query: single,
            explore,
            rows: Array.from({ length: 7 }, (_, i) => ({
                b_dim1: i,
                a_met1: 1,
            })),
        });
        expect(evaluate.mock.calls[1][0].questions.type).not.toHaveProperty(
            'criteria.pie',
        );
    });

    it('preserves explicit styling even when another chart could fit better', async () => {
        const { decisions } = createDecisions({
            fit: { type: 'score', score: 1, confidence: 0.99 },
            repair: noul(0.99),
            explicitStyle: noul(0.99),
        });
        const input = { ...query, chartConfig: existing };
        const result = await resolveChartPresentation({
            decisions,
            question: 'Use a bar chart',
            query: input,
            explore,
            rows,
        });
        expect(result.config).toBeNull();
        expect(result.advice).toHaveLength(1);
        expect(input.chartConfig).toEqual(existing);
    });

    it('replaces a clearly poor unrequested encoding before publication', async () => {
        const { decisions } = createDecisions({
            fit: { type: 'score', score: 0, confidence: 0.99 },
            repair: noul(0.99),
            explicitStyle: noul(0.01),
        });
        const result = await resolveChartPresentation({
            decisions,
            question: 'Revenue trends by region',
            query: { ...query, chartConfig: existing },
            explore,
            rows,
        });
        expect(result.config?.defaultVizType).toBe('line');
    });

    it('falls back on provider failure and does not call it for empty results', async () => {
        const { decisions, evaluate } = createDecisions();
        evaluate.mockResolvedValue(null);
        expect(
            await resolveChartPresentation({
                decisions,
                question: 'Revenue',
                query,
                explore,
                rows,
            }),
        ).toMatchObject({ config: { defaultVizType: 'line' }, advice: [] });
        evaluate.mockClear();
        await resolveChartPresentation({
            decisions,
            question: 'Revenue',
            query,
            explore,
            rows: [],
        });
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('does not treat null or nonfinite result values as numeric chart data', () => {
        const shape = getChartResultShape(query, explore, [
            { a_met1: null },
            { a_met1: Infinity },
        ]);
        expect(shape.metrics[0].numeric).toBe(false);
    });
});
