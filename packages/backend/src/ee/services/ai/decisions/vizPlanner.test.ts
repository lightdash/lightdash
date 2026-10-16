import {
    ChartKind,
    DimensionType,
    QuerySourceType,
    type ComposerCustomVizConfig,
    type CustomChartType,
    type DataAppVizSchema,
    type ResultColumn,
    type ResultColumns,
    type SourceQuery,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { ResolveCustomChartTypeFn } from '../types/aiAgentDependencies';
import type { DecisionAnswers, DecisionQuestion } from './AiDecisionClient';
import {
    createVizPlanner,
    getOfferedCustomChartTypes,
    getVizConfigFromAnswers,
    getVizPlannerShape,
} from './vizPlanner';

const column = (reference: string, type: DimensionType): ResultColumn => ({
    reference,
    type,
});
const columns: ResultColumns = {
    region: column('region', DimensionType.STRING),
    month: column('month', DimensionType.DATE),
    revenue: column('revenue', DimensionType.NUMBER),
    orders: column('orders', DimensionType.NUMBER),
};
const rows = [
    { region: 'EMEA', month: '2026-01-01', revenue: 10, orders: 1 },
    { region: 'AMER', month: '2026-02-01', revenue: 20, orders: 2 },
];
const node: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    exploreName: 'orders',
    dimensions: ['region', 'month'],
    metrics: ['revenue', 'orders'],
};

const barsSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
            description: 'What each bar is',
        },
        {
            name: 'values',
            label: 'Values',
            type: 'metric',
            required: true,
            multiple: true,
        },
        { name: 'series', label: 'Series', type: 'series', required: false },
    ],
    configOptions: [
        {
            type: 'select',
            name: 'orientation',
            label: 'Orientation',
            choices: [
                { value: 'vertical', label: 'Vertical' },
                { value: 'horizontal', label: 'Horizontal' },
            ],
            default: 'vertical',
        },
        { type: 'boolean', name: 'stacked', label: 'Stacked', default: false },
        { type: 'text', name: 'subtitle', label: 'Subtitle', default: '' },
    ],
    colorPalette: null,
};
const chartType = (
    slug: string,
    schema: DataAppVizSchema = barsSchema,
): CustomChartType => ({
    slug,
    name: `Chart ${slug}`,
    description: `Draws ${slug}.`,
    schema,
});
const bars = chartType('bars');

const resolver =
    (schema: DataAppVizSchema = barsSchema): ResolveCustomChartTypeFn =>
    async (slug) => ({
        dataAppVizUuid: `uuid-${slug}`,
        dataAppVizVersion: 3,
        schema,
    });

const choice = (value: string, confidence = 0.99) => ({
    type: 'choice' as const,
    choice: value,
    confidence,
    probabilities: { [value]: confidence },
});
const noul = (value: number) => ({ type: 'noul' as const, noul: value });

const shapeOf = (customChartTypes: CustomChartType[]) =>
    getVizPlannerShape({
        columns,
        rows,
        rowCount: rows.length,
        enableDataAccess: true,
        customChartTypes,
        node,
    }).shape;

const barsAnswers: DecisionAnswers = {
    kind: choice('custom:bars'),
    explicitStyle: noul(0.1),
    'custom:bars:slot:category': choice('region'),
    'custom:bars:slot:values:revenue': noul(0.9),
    'custom:bars:slot:values:orders': noul(0.65),
    'custom:bars:slot:series': choice('none'),
    'custom:bars:option:orientation': choice('horizontal'),
    'custom:bars:option:stacked': noul(0.95),
};

const plan = (
    answers: DecisionAnswers,
    resolve: ResolveCustomChartTypeFn = resolver(),
) =>
    getVizConfigFromAnswers({
        answers,
        shape: shapeOf([bars]),
        columns,
        node,
        previousVizConfig: null,
        previousCustom: null,
        resolveCustomChartType: resolve,
    });

describe('getVizConfigFromAnswers for a custom chart type', () => {
    it('builds the binding from the chosen branch', async () => {
        const planned = await plan(barsAnswers);
        expect(planned?.vizConfig).toEqual({
            type: ChartKind.DATA_APP_VIZ,
            metadata: { version: 1 },
            dataAppVizUuid: 'uuid-bars',
            dataAppVizVersion: 3,
            fieldMapping: {
                category: 'region',
                values: ['revenue', 'orders'],
            },
            optionValues: { orientation: 'horizontal', stacked: true },
        });
        expect(planned?.note).toBe(
            'Visualization: custom chart "Chart bars", category = region, values = revenue, orders.',
        );
    });

    it('takes multiple members in result-column order and drops unsure ones', async () => {
        const planned = await plan({
            ...barsAnswers,
            'custom:bars:slot:values:revenue': noul(0.4),
        });
        expect(planned?.vizConfig).toMatchObject({
            fieldMapping: { values: ['orders'] },
        });
    });

    it('binds an optional slot when picked and omits default options', async () => {
        const planned = await plan({
            ...barsAnswers,
            'custom:bars:slot:series': choice('month'),
            'custom:bars:option:orientation': choice('default'),
            'custom:bars:option:stacked': noul(0.5),
        });
        expect(planned?.vizConfig).toMatchObject({
            fieldMapping: { category: 'region', series: 'month' },
            optionValues: {},
        });
    });

    it('returns null when a required slot is unresolved', async () => {
        expect(
            await plan({
                ...barsAnswers,
                'custom:bars:slot:category': choice('region', 0.5),
            }),
        ).toBeNull();
        expect(
            await plan({
                ...barsAnswers,
                'custom:bars:slot:values:revenue': noul(0.1),
                'custom:bars:slot:values:orders': noul(0.1),
            }),
        ).toBeNull();
    });

    it('returns null for a column outside the slot pool', async () => {
        expect(
            await plan({
                ...barsAnswers,
                'custom:bars:slot:category': choice('revenue'),
            }),
        ).toBeNull();
    });

    it('returns null when the resolved schema rejects the binding', async () => {
        const stricter: DataAppVizSchema = {
            ...barsSchema,
            fields: barsSchema.fields.map((field) =>
                field.name === 'category'
                    ? { ...field, type: 'metric' }
                    : field,
            ),
        };
        expect(await plan(barsAnswers, resolver(stricter))).toBeNull();
        expect(await plan(barsAnswers, async () => null)).toBeNull();
    });

    it('needs confidence unless the request was explicit', async () => {
        const unsure = { ...barsAnswers, kind: choice('custom:bars', 0.5) };
        expect(await plan(unsure)).toBeNull();
        expect(
            await plan({ ...unsure, explicitStyle: noul(0.95) }),
        ).not.toBeNull();
    });
});

describe('getOfferedCustomChartTypes', () => {
    const resultColumns = Object.values(columns);

    it('offers only types whose required slots can be filled', () => {
        const needsDimension = chartType('needs-dimension', {
            ...barsSchema,
            fields: [barsSchema.fields[0]],
        });
        const numericOnly = [columns.revenue, columns.orders];
        expect(
            getOfferedCustomChartTypes({
                customChartTypes: [needsDimension],
                columns: numericOnly,
                node: null,
                rowCount: 2,
            }),
        ).toEqual([]);
        expect(
            getOfferedCustomChartTypes({
                customChartTypes: [needsDimension],
                columns: resultColumns,
                node,
                rowCount: 0,
            }),
        ).toEqual([]);
    });

    it('caps the offer at five in library order and asks only select and boolean options', () => {
        const types = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((slug) =>
            chartType(slug),
        );
        const offered = getOfferedCustomChartTypes({
            customChartTypes: types,
            columns: resultColumns,
            node,
            rowCount: 2,
        });
        expect(offered.map(({ key }) => key)).toEqual([
            'custom:a',
            'custom:b',
            'custom:c',
            'custom:d',
            'custom:e',
        ]);
        expect(offered[0].options.map(({ name }) => name)).toEqual([
            'orientation',
            'stacked',
        ]);
        expect(offered[0].slots.map(({ pool }) => pool)).toEqual([
            ['region', 'month'],
            ['revenue', 'orders'],
            ['region', 'month'],
        ]);
    });
});

describe('createVizPlanner with custom chart types', () => {
    const previousVizConfig: ComposerCustomVizConfig = {
        type: ChartKind.DATA_APP_VIZ,
        metadata: { version: 1 },
        dataAppVizUuid: 'uuid-bars',
        dataAppVizVersion: 2,
        fieldMapping: { category: 'month', values: ['revenue'] },
        optionValues: { stacked: true },
    };

    it('asks every branch in one call and keeps the previous binding', async () => {
        let asked: Record<string, DecisionQuestion> = {};
        let state: unknown = null;
        const evaluate = vi.fn(async (args) => {
            asked = args.questions;
            state = args.state;
            return {
                ...barsAnswers,
                'custom:bars:slot:category': choice('keep'),
                'custom:bars:option:stacked': noul(0.5),
            };
        });
        const recordDecision = vi.fn(async () => {});
        const planViz = createVizPlanner({
            decisions: { evaluate },
            question: 'Revenue by month as bars',
            recordDecision,
            customChartTypes: [bars],
            resolveCustomChartType: resolver(),
        });

        const planned = await planViz({
            title: null,
            description: null,
            terminalNode: { title: null, description: null },
            node,
            columns,
            rows,
            rowCount: rows.length,
            enableDataAccess: true,
            previousVizConfig,
        });

        expect(evaluate).toHaveBeenCalledTimes(1);
        expect(Object.keys(asked)).toEqual(
            expect.arrayContaining([
                'kind',
                'custom:bars:slot:category',
                'custom:bars:slot:values:revenue',
                'custom:bars:slot:values:orders',
                'custom:bars:slot:series',
                'custom:bars:option:orientation',
                'custom:bars:option:stacked',
            ]),
        );
        expect(asked).not.toHaveProperty('custom:bars:option:subtitle');
        const category = asked['custom:bars:slot:category'];
        expect(category.type === 'choice' && category.criteria).toHaveProperty(
            'keep',
        );
        expect(category.instructions).toContain(
            'If the custom chart type "Chart bars" were chosen',
        );
        expect(state).toMatchObject({
            supportedKinds: expect.arrayContaining(['custom:bars']),
            customChartTypes: [{ slug: 'bars', name: 'Chart bars' }],
        });
        expect(planned?.vizConfig).toMatchObject({
            fieldMapping: { category: 'month', values: ['revenue', 'orders'] },
            optionValues: { orientation: 'horizontal', stacked: true },
        });
        expect(recordDecision).toHaveBeenCalledWith(
            expect.objectContaining({
                outcome: 'planned',
                intent: { vizConfig: planned?.vizConfig },
            }),
        );
    });
});
