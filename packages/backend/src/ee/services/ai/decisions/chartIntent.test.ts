import {
    DimensionType,
    FieldType,
    MetricType,
    type AiSemanticChartArtifactConfig,
    type Explore,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecisionAnswers } from './AiDecisionClient';
import {
    buildChartIntentContext,
    buildChartIntentQuestions,
    decideTurn,
    extractAmountCandidates,
    extractNumberCandidates,
    extractTextCandidates,
    interpretChartIntent,
    isChartEditAttempt,
    matchChartChoice,
    parseStoredChoices,
    selectFilterValues,
    type ChartFilterRule,
    type ChartIntentResolution,
} from './chartIntent';

const dimension = (name: string, type: DimensionType, label: string) => ({
    name,
    table: 'orders',
    fieldType: FieldType.DIMENSION,
    type,
    label,
});

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    tables: {
        orders: {
            label: 'Orders',
            dimensions: {
                date: dimension('date', DimensionType.DATE, 'Date'),
                status: dimension('status', DimensionType.STRING, 'Status'),
                region: dimension('region', DimensionType.STRING, 'Region'),
                city: dimension('city', DimensionType.STRING, 'City'),
            },
            metrics: {
                count: {
                    name: 'count',
                    table: 'orders',
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                    label: 'Count',
                },
            },
        },
    },
} as unknown as Explore;

const artifact: AiSemanticChartArtifactConfig = {
    source: 'semantic',
    config: {
        title: 'Orders',
        description: 'Orders over time',
        queryConfig: {
            exploreName: 'orders',
            dimensions: ['orders_date', 'orders_status'],
            metrics: ['orders_count'],
            sorts: [],
            limit: 500,
            parameters: null,
            customMetrics: null,
            tableCalculations: null,
            filters: null,
        },
        chartConfig: {
            defaultVizType: 'bar',
            xAxisDimension: 'orders_date',
            yAxisMetrics: ['orders_count'],
            groupBy: ['orders_status'],
            xAxisType: 'time',
            stackBars: null,
            lineType: null,
            xAxisLabel: '',
            yAxisLabel: '',
            secondaryYAxisMetric: null,
            secondaryYAxisLabel: null,
        },
    },
};

const choice = (value: string, probability = 0.95) => ({
    type: 'choice' as const,
    choice: value,
    confidence: probability,
    probabilities: { [value]: probability, other: 1 - probability },
});
const noul = (value: number) => ({ type: 'noul' as const, noul: value });
const noUsage = { verified: new Map<string, number>(), charts: new Map() };

const interpret = (prompt: string, answers: Partial<DecisionAnswers>) =>
    interpretChartIntent({
        answers: {
            multiple: noul(0.05),
            nonEdit: noul(0.05),
            ...answers,
        } as DecisionAnswers,
        prompt,
        context: buildChartIntentContext({
            filterRules: [],
            prompt,
            artifact,
            explore,
            usage: noUsage,
        }),
    });

describe('interpretChartIntent', () => {
    it('leaves new questions to the agent', () => {
        expect(
            interpret('why did orders drop?', {
                intent: choice('new_question'),
            }),
        ).toEqual({ type: 'not_an_edit' });
    });

    it('resolves a chart type and prefers it over a swap', () => {
        expect(
            interpret('horizontal bars', {
                intent: choice('swap_axes'),
                chartType: choice('horizontal'),
            }),
        ).toEqual({
            type: 'intent',
            intent: { kind: 'chart_type', chartType: 'horizontal' },
        });
    });

    it('adds a chosen field together with a named chart type', () => {
        expect(
            interpret('add region to the line chart', {
                intent: choice('add_field'),
                addField: choice('orders_region'),
                chartType: choice('line'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'add_field',
                fieldId: 'orders_region',
                chartType: 'line',
            },
        });
    });

    it('does not add a field JEV could not pick confidently', () => {
        expect(
            interpret('segment by colour of the moon', {
                intent: choice('add_field'),
                addField: choice('none'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'add-field' });
    });

    it('asks for warehouse values before applying a value filter', () => {
        expect(
            interpret('drop the cancelled ones', {
                intent: choice('filter'),
                filterKind: choice('exclude_values'),
                valueFilterField: choice('orders_status'),
            }),
        ).toEqual({
            type: 'needs_values',
            filter: {
                fieldId: 'orders_status',
                exclude: true,
                alternativeFieldIds: [],
            },
        });
    });

    it('keeps runner-up value fields when the field choice is uncertain', () => {
        expect(
            interpret('exclude west', {
                intent: choice('filter'),
                filterKind: choice('exclude_values'),
                valueFilterField: {
                    type: 'choice',
                    choice: 'orders_region',
                    confidence: 0.45,
                    probabilities: {
                        orders_region: 0.45,
                        orders_city: 0.4,
                        orders_status: 0.05,
                        none: 0.1,
                    },
                },
            }),
        ).toEqual({
            type: 'needs_values',
            filter: {
                fieldId: 'orders_region',
                exclude: true,
                alternativeFieldIds: ['orders_city'],
            },
        });
    });

    it('never assumes the filter field when JEV names none', () => {
        expect(
            interpret('only the ones from the website', {
                intent: choice('filter'),
                filterKind: choice('include_values'),
                valueFilterField: choice('none'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'filter-field' });
    });

    it('uses the only date dimension for a trailing window', () => {
        expect(
            interpret('last 6 months', {
                intent: choice('filter'),
                filterKind: choice('last_period'),
                periodUnit: choice('months'),
                number: choice('6'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_period',
                fieldId: 'orders_date',
                period: { type: 'last', count: 6, unit: 'months' },
            },
        });
    });

    it('reads a named calendar year and month from the prompt', () => {
        expect(
            interpret('only March 2024', {
                intent: choice('filter'),
                filterKind: choice('calendar_period'),
                calendarYear: choice('2024'),
                calendarPeriod: choice('m3'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_period',
                fieldId: 'orders_date',
                period: {
                    type: 'calendar',
                    year: 2024,
                    quarter: null,
                    month: 3,
                },
            },
        });
    });

    it('reads a named quarter as one calendar period', () => {
        expect(
            interpret('only Q3 2024', {
                intent: choice('filter'),
                filterKind: choice('calendar_period'),
                calendarYear: choice('2024'),
                calendarPeriod: choice('q3'),
            }),
        ).toMatchObject({
            intent: {
                period: {
                    type: 'calendar',
                    year: 2024,
                    quarter: 3,
                    month: null,
                },
            },
        });
    });

    it('does not widen an unsure period to the whole year', () => {
        expect(
            interpret('only Q3 2024', {
                intent: choice('filter'),
                filterKind: choice('calendar_period'),
                calendarYear: choice('2024'),
                calendarPeriod: choice('q3', 0.45),
            }),
        ).toEqual({ type: 'unresolved', reason: 'filter-calendar' });
    });

    it('does not read a count as a calendar year', () => {
        expect(
            interpret('top 2000 customers in March', {
                intent: choice('filter'),
                filterKind: choice('calendar_period'),
                calendarYear: choice('none'),
                calendarPeriod: choice('m3'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'filter-calendar' });
    });

    it('needs exactly one stated year for a calendar period', () => {
        expect(
            interpret('from 2022 to 2024', {
                intent: choice('filter'),
                filterKind: choice('calendar_period'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'filter-calendar' });
    });

    it('resolves the previous complete period', () => {
        expect(
            interpret('last year only', {
                intent: choice('filter'),
                filterKind: choice('previous_period'),
                periodUnit: choice('years'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_period',
                fieldId: 'orders_date',
                period: { type: 'previous', unit: 'years' },
            },
        });
    });

    it('only accepts numbers stated in the prompt', () => {
        expect(
            interpret('top few', {
                intent: choice('sort'),
                sortDirection: choice('descending'),
                sortFieldNamed: noul(0.1),
                number: choice('10'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'sort',
                fieldId: null,
                descending: true,
                limit: null,
            },
        });
    });

    it('sorts by a named field', () => {
        expect(
            interpret('sort by count, lowest first', {
                intent: choice('sort'),
                sortDirection: choice('ascending'),
                sortFieldNamed: noul(0.95),
                sortField: choice('orders_count'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'sort',
                fieldId: 'orders_count',
                descending: false,
                limit: null,
            },
        });
    });

    it('leaves requests that also ask for something else to the agent', () => {
        const resolution = interpret('make it a line and save it', {
            intent: choice('chart_type'),
            nonEdit: noul(0.93),
            chartType: choice('line'),
        });
        expect(resolution).toEqual({ type: 'unresolved', reason: 'non-edit' });
        expect(isChartEditAttempt(resolution)).toBe(false);
    });

    it('applies every edit a request names, never just the primary one', () => {
        expect(
            interpret('top 3 as horizontal bars', {
                intent: choice('chart_type'),
                chartType: choice('horizontal'),
                wantsSort: noul(0.95),
                sortDirection: choice('descending'),
                sortFieldNamed: noul(0.2),
                number: choice('3'),
            }),
        ).toEqual({
            type: 'compound',
            steps: [
                {
                    type: 'intent',
                    intent: {
                        kind: 'sort',
                        fieldId: null,
                        descending: true,
                        limit: 3,
                    },
                },
                {
                    type: 'intent',
                    intent: { kind: 'chart_type', chartType: 'horizontal' },
                },
            ],
        });
    });

    it('falls back when any part of a compound request is unresolved', () => {
        expect(
            interpret('segment by region and sort it', {
                intent: choice('add_field'),
                addField: choice('orders_region'),
                wantsSort: noul(0.9),
            }),
        ).toEqual({ type: 'unresolved', reason: 'multiple' });
    });

    it('does not combine edits with a non-composable intent', () => {
        expect(
            interpret('stack it and only last 6 months', {
                intent: choice('stack'),
                wantsFilter: noul(0.9),
            }),
        ).toEqual({ type: 'unresolved', reason: 'multiple' });
    });

    it('never applies a single edit when JEV says several were asked for', () => {
        expect(
            interpret('make it a line and do the other thing', {
                intent: choice('chart_type'),
                multiple: noul(0.9),
                chartType: choice('line'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'multiple' });
    });

    it('treats adding a field in a named chart type as one edit', () => {
        expect(
            interpret('split by region as a line chart', {
                intent: choice('add_field'),
                addField: choice('orders_region'),
                chartType: choice('line'),
                wantsChartType: noul(0.95),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'add_field',
                fieldId: 'orders_region',
                chartType: 'line',
            },
        });
    });

    it('asks which field when JEV splits between two candidates', () => {
        expect(
            interpret('segment by place', {
                intent: choice('add_field'),
                addField: {
                    type: 'choice',
                    choice: 'orders_region',
                    confidence: 0.4,
                    probabilities: {
                        orders_region: 0.55,
                        orders_city: 0.35,
                        none: 0.1,
                    },
                },
                chartType: choice('line'),
            }),
        ).toEqual({
            type: 'clarify',
            question: 'Which field should I add?',
            options: [
                {
                    label: 'Region',
                    prompt: 'Add Region to the chart as a line chart',
                    intent: null,
                },
                {
                    label: 'City',
                    prompt: 'Add City to the chart as a line chart',
                    intent: null,
                },
            ],
        });
    });

    it('prefers the verified field when JEV scores two fields nearly the same', () => {
        const splitAnswer = {
            type: 'choice' as const,
            choice: 'orders_region',
            confidence: 0.4,
            probabilities: {
                orders_region: 0.48,
                orders_city: 0.42,
                none: 0.1,
            },
        };
        const context = buildChartIntentContext({
            filterRules: [],
            prompt: 'segment by place',
            artifact,
            explore,
            usage: {
                verified: new Map([['orders_city::dimension', 3]]),
                charts: new Map(),
            },
        });
        expect(
            interpretChartIntent({
                answers: {
                    intent: choice('add_field'),
                    multiple: noul(0.05),
                    nonEdit: noul(0.05),
                    addField: splitAnswer,
                } as DecisionAnswers,
                prompt: 'segment by place',
                context,
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'add_field',
                fieldId: 'orders_city',
                chartType: null,
            },
        });
    });

    it('orders clarification chips by verified then chart usage', () => {
        const context = buildChartIntentContext({
            filterRules: [],
            prompt: 'segment by place',
            artifact,
            explore,
            usage: {
                verified: new Map(),
                charts: new Map([['orders_city', 40]]),
            },
        });
        expect(
            interpretChartIntent({
                answers: {
                    intent: choice('add_field'),
                    multiple: noul(0.05),
                    nonEdit: noul(0.05),
                    addField: {
                        type: 'choice',
                        choice: 'orders_region',
                        confidence: 0.4,
                        probabilities: {
                            orders_region: 0.55,
                            orders_city: 0.35,
                            none: 0.1,
                        },
                    },
                } as DecisionAnswers,
                prompt: 'segment by place',
                context,
            }),
        ).toMatchObject({
            type: 'clarify',
            options: [{ label: 'City' }, { label: 'Region' }],
        });
    });

    it('applies a confident field even when others share some probability', () => {
        expect(
            interpret('segment by region', {
                intent: choice('add_field'),
                addField: {
                    type: 'choice',
                    choice: 'orders_region',
                    confidence: 0.85,
                    probabilities: { orders_region: 0.85, orders_city: 0.15 },
                },
            }),
        ).toMatchObject({
            type: 'intent',
            intent: { kind: 'add_field', fieldId: 'orders_region' },
        });
    });

    const interpretFiltered = (
        prompt: string,
        answers: Partial<DecisionAnswers>,
    ) =>
        interpretChartIntent({
            answers: {
                multiple: noul(0.05),
                nonEdit: noul(0.05),
                ...answers,
            } as DecisionAnswers,
            prompt,
            context: buildChartIntentContext({
                filterRules: [
                    {
                        fieldId: 'orders_date',
                        operator: 'inBetween',
                        values: ['2024-01-01', '2024-12-31'],
                    },
                    {
                        fieldId: 'orders_region',
                        operator: 'equals',
                        values: ['North'],
                    },
                ],
                prompt,
                artifact,
                explore,
                usage: noUsage,
            }),
        });

    it('removes the one filter JEV picks among the chart filters', () => {
        expect(
            interpretFiltered('show every region again', {
                intent: choice('remove_filter'),
                removeFilterField: choice('orders_region'),
            }),
        ).toEqual({
            type: 'intent',
            intent: { kind: 'remove_filter', fieldId: 'orders_region' },
        });
    });

    it('does not remove a filter JEV cannot tie to the chart filters', () => {
        expect(
            interpretFiltered('show every status again', {
                intent: choice('remove_filter'),
                removeFilterField: choice('none'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'remove-filter' });
        expect(
            interpretFiltered('show every region again', {
                intent: choice('remove_filter'),
                removeFilterField: choice('orders_region', 0.4),
            }),
        ).toEqual({ type: 'unresolved', reason: 'remove-filter' });
    });

    it('does not read removing a filter as a second filter edit', () => {
        expect(
            interpretFiltered('drop the region filter', {
                intent: choice('remove_filter'),
                removeFilterField: choice('orders_region'),
                wantsFilter: noul(0.9),
            }),
        ).toEqual({
            type: 'intent',
            intent: { kind: 'remove_filter', fieldId: 'orders_region' },
        });
    });

    it('removes a clearly leading filter without asking', () => {
        expect(
            interpretFiltered('show me all regions again', {
                intent: choice('remove_filter'),
                removeFilterField: {
                    type: 'choice',
                    choice: 'orders_region',
                    confidence: 0.74,
                    probabilities: { orders_region: 0.74, orders_date: 0.25 },
                },
            }),
        ).toEqual({
            type: 'intent',
            intent: { kind: 'remove_filter', fieldId: 'orders_region' },
        });
    });

    it('asks which filter to remove when JEV splits between two', () => {
        expect(
            interpretFiltered('show everything again', {
                intent: choice('remove_filter'),
                removeFilterField: {
                    type: 'choice',
                    choice: 'orders_region',
                    confidence: 0.5,
                    probabilities: {
                        orders_region: 0.5,
                        orders_date: 0.42,
                        none: 0.08,
                    },
                },
            }),
        ).toEqual({
            type: 'clarify',
            question: 'Which filter should I remove?',
            options: [
                {
                    label: 'Region',
                    prompt: 'Remove the Region filter',
                    intent: null,
                },
                {
                    label: 'Date',
                    prompt: 'Remove the Date filter',
                    intent: null,
                },
            ],
        });
    });

    it('treats low-confidence intents as unresolved', () => {
        expect(interpret('hmm', { intent: choice('chart_type', 0.3) })).toEqual(
            { type: 'unresolved', reason: 'intent' },
        );
    });
});

describe('metric, breakdown and grain edits', () => {
    const rich = structuredClone(explore);
    Object.assign(rich.tables.orders.metrics, {
        revenue: {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
        },
    });
    Object.assign(rich.tables.orders.dimensions, {
        date: {
            ...dimension('date', DimensionType.DATE, 'Date'),
            timeInterval: 'DAY',
            timeIntervalBaseDimensionName: 'date',
        },
        date_week: {
            ...dimension('date_week', DimensionType.DATE, 'Date week'),
            timeInterval: 'WEEK',
            timeIntervalBaseDimensionName: 'date',
        },
    });
    const run = (answers: Partial<DecisionAnswers>) =>
        interpretChartIntent({
            answers: {
                multiple: noul(0.05),
                nonEdit: noul(0.05),
                ...answers,
            } as DecisionAnswers,
            prompt: 'edit',
            context: buildChartIntentContext({
                filterRules: [],
                prompt: 'edit',
                artifact,
                explore: rich,
                usage: noUsage,
            }),
        });

    it('adds the metric JEV picks', () => {
        expect(
            run({
                intent: choice('add_metric'),
                metricToAdd: choice('orders_revenue'),
            }),
        ).toEqual({
            type: 'intent',
            intent: { kind: 'add_metric', fieldId: 'orders_revenue' },
        });
    });

    it('swaps the only metric without asking which one', () => {
        expect(
            run({
                intent: choice('swap_metric'),
                metricToAdd: choice('orders_revenue'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'swap_metric',
                fromFieldId: 'orders_count',
                toFieldId: 'orders_revenue',
            },
        });
    });

    it('never removes the only metric', () => {
        expect(run({ intent: choice('remove_metric') })).toEqual({
            type: 'unresolved',
            reason: 'remove-metric',
        });
    });

    it('removes the breakdown JEV picks among the chart dimensions', () => {
        expect(
            run({
                intent: choice('remove_field'),
                fieldToRemove: choice('orders_status'),
            }),
        ).toEqual({
            type: 'intent',
            intent: { kind: 'remove_field', fieldId: 'orders_status' },
        });
    });

    it('changes the grain of the one date dimension', () => {
        expect(
            run({
                intent: choice('change_grain'),
                grain: choice('orders_date_week'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'change_grain',
                fromFieldId: 'orders_date',
                toFieldId: 'orders_date_week',
            },
        });
    });

    it('swaps a breakdown when JEV says the new field replaces one', () => {
        expect(
            run({
                intent: choice('add_field'),
                addField: choice('orders_region'),
                replacesField: noul(0.9),
                fieldToRemove: choice('orders_status'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'swap_field',
                fromFieldId: 'orders_status',
                toFieldId: 'orders_region',
            },
        });
    });

    it('reads a split by a field not in the chart as adding it', () => {
        expect(
            run({
                intent: choice('split_series'),
                wantsAddField: noul(0.8),
                addField: choice('orders_region'),
                replacesField: noul(0.1),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'add_field',
                fieldId: 'orders_region',
                chartType: null,
            },
        });
    });

    it('asks whether to add or replace when a replacement is likely but not sure', () => {
        expect(
            run({
                intent: choice('add_field'),
                addField: choice('orders_region'),
                replacesField: noul(0.6),
                fieldToRemove: choice('orders_status'),
            }),
        ).toMatchObject({
            type: 'clarify',
            question: 'How should I use Region?',
            options: [
                { intent: { kind: 'add_field', fieldId: 'orders_region' } },
                {
                    intent: {
                        kind: 'swap_field',
                        fromFieldId: 'orders_status',
                        toFieldId: 'orders_region',
                    },
                },
            ],
        });
    });

    it('asks which new field replaces the breakdown when two fit', () => {
        expect(
            run({
                intent: choice('add_field'),
                addField: {
                    type: 'choice',
                    choice: 'orders_region',
                    confidence: 0.55,
                    probabilities: { orders_region: 0.55, orders_city: 0.4 },
                },
                replacesField: noul(0.9),
                fieldToRemove: choice('orders_status'),
            }),
        ).toEqual({
            type: 'clarify',
            question: 'Which field should replace Status?',
            options: [
                {
                    label: 'Region',
                    prompt: 'Break down by Region instead of Status',
                    intent: null,
                },
                {
                    label: 'City',
                    prompt: 'Break down by City instead of Status',
                    intent: null,
                },
            ],
        });
    });

    it('adds the breakdown alongside when it does not replace one', () => {
        expect(
            run({
                intent: choice('add_field'),
                addField: choice('orders_region'),
                replacesField: noul(0.2),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'add_field',
                fieldId: 'orders_region',
                chartType: null,
            },
        });
    });
});

describe('choices when the user names a field but not the edit', () => {
    const withRevenue = structuredClone(explore);
    Object.assign(withRevenue.tables.orders.metrics, {
        revenue: {
            name: 'revenue',
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label: 'Revenue',
        },
    });
    const unsure = (newQuestion: number) => ({
        type: 'choice' as const,
        choice: 'unclear',
        confidence: 0.5,
        probabilities: {
            unclear: 0.6 - newQuestion,
            new_question: newQuestion,
            swap_metric: 0.4,
        },
    });
    const run = (answers: Partial<DecisionAnswers>) =>
        interpretChartIntent({
            answers: {
                multiple: noul(0.05),
                nonEdit: noul(0.05),
                ...answers,
            } as DecisionAnswers,
            prompt: 'revenue',
            context: buildChartIntentContext({
                filterRules: [],
                prompt: 'revenue',
                artifact,
                explore: withRevenue,
                usage: noUsage,
            }),
        });

    it('offers adding or swapping in the metric JEV is sure about', () => {
        expect(
            run({ intent: unsure(0.1), metricToAdd: choice('orders_revenue') }),
        ).toEqual({
            type: 'clarify',
            question: 'What should I do with Revenue?',
            options: [
                {
                    label: 'Add Revenue',
                    prompt: 'Add Revenue to the chart',
                    intent: { kind: 'add_metric', fieldId: 'orders_revenue' },
                },
                {
                    label: 'Replace Count',
                    prompt: 'Show Revenue instead of Count',
                    intent: {
                        kind: 'swap_metric',
                        fromFieldId: 'orders_count',
                        toFieldId: 'orders_revenue',
                    },
                },
            ],
        });
    });

    it('offers adding or replacing a breakdown', () => {
        expect(
            run({
                intent: unsure(0.1),
                metricToAdd: choice('none'),
                addField: choice('orders_region'),
            }),
        ).toMatchObject({
            type: 'clarify',
            options: [
                {
                    label: 'Add Region',
                    intent: { kind: 'add_field', fieldId: 'orders_region' },
                },
                {
                    label: 'Replace Status',
                    intent: {
                        kind: 'swap_field',
                        fromFieldId: 'orders_status',
                        toFieldId: 'orders_region',
                    },
                },
            ],
        });
    });

    it('swaps the breakdown when JEV is sure the named field replaces it', () => {
        expect(
            run({
                intent: unsure(0.1),
                metricToAdd: choice('none'),
                addField: choice('orders_region'),
                replacesField: noul(0.85),
                fieldToRemove: choice('orders_status'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'swap_field',
                fromFieldId: 'orders_status',
                toFieldId: 'orders_region',
            },
        });
        expect(
            run({
                intent: unsure(0.1),
                metricToAdd: choice('none'),
                addField: choice('orders_region'),
                replacesField: noul(0.85),
                fieldToRemove: choice('orders_status', 0.4),
            }),
        ).toMatchObject({ type: 'clarify' });
    });

    it('asks when a new question only narrowly wins over edits', () => {
        const narrow = {
            type: 'choice' as const,
            choice: 'new_question',
            confidence: 0.47,
            probabilities: {
                new_question: 0.47,
                swap_metric: 0.3,
                add_metric: 0.15,
                unclear: 0.08,
            },
        };
        expect(
            run({ intent: narrow, metricToAdd: choice('orders_revenue') }),
        ).toMatchObject({ type: 'clarify' });
        expect(
            run({
                intent: narrow,
                nonEdit: noul(0.8),
                metricToAdd: choice('orders_revenue'),
            }),
        ).toEqual({ type: 'not_an_edit' });
    });

    it('leaves questions and unsure field picks to the agent', () => {
        expect(
            run({ intent: unsure(0.6), metricToAdd: choice('orders_revenue') }),
        ).toEqual({ type: 'unresolved', reason: 'intent' });
        expect(
            run({
                intent: unsure(0.1),
                metricToAdd: choice('orders_revenue', 0.45),
                addField: choice('orders_region'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'intent' });
    });

    it('applies a stored choice only when its exact text comes back', () => {
        const choices = parseStoredChoices({
            question: 'What should I do with Revenue?',
            options: [
                {
                    label: 'Add Revenue',
                    prompt: 'Add Revenue to the chart',
                    intent: { kind: 'add_metric', fieldId: 'orders_revenue' },
                },
            ],
        });
        expect(matchChartChoice(choices, ' Add Revenue to the chart ')).toEqual(
            { kind: 'add_metric', fieldId: 'orders_revenue' },
        );
        expect(matchChartChoice(choices, 'add revenue')).toBeNull();
        expect(parseStoredChoices({ options: [{ label: 'x' }] })).toEqual([]);
        expect(parseStoredChoices(null)).toEqual([]);
    });
});

describe('date ranges and thresholds', () => {
    afterEach(() => {
        vi.useRealTimers();
    });
    const ask = (prompt: string, answers: Partial<DecisionAnswers>) =>
        interpret(prompt, {
            intent: choice('filter'),
            filterField: choice('orders_date'),
            ...answers,
        });

    it('only asks choices with at least two real options', () => {
        const context = buildChartIntentContext({
            filterRules: [],
            prompt: 'x',
            artifact,
            explore,
            usage: noUsage,
        });
        ['top 5', 'before 2024', 'since june 2024', 'over 10k'].forEach(
            (prompt) =>
                Object.values(
                    buildChartIntentQuestions({ prompt, context }),
                ).forEach((question) => {
                    if (question.type === 'choice')
                        expect(
                            Object.keys(question.criteria).filter(
                                (key) => key !== 'none',
                            ).length,
                        ).toBeGreaterThan(0);
                }),
        );
    });

    it('reads amounts with separators, decimals and suffixes', () => {
        expect(extractAmountCandidates('under $1,000, 27k or 4.5')).toEqual([
            1000, 27000, 4.5,
        ]);
    });

    it('builds an explicit range with an inclusive last day', () => {
        expect(
            ask('13 to 20 May 2026', {
                filterKind: choice('date_range'),
                rangeShape: choice('between'),
                startDay: choice('13'),
                startMonth: choice('m5'),
                startYear: choice('none'),
                endDay: choice('20'),
                endMonth: choice('m5'),
                endYear: choice('2026'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_period',
                fieldId: 'orders_date',
                period: {
                    type: 'range',
                    start: '2026-05-13',
                    end: '2026-05-21',
                },
            },
        });
    });

    it('builds open ranges from a start or before an end', () => {
        expect(
            ask('since March 2024', {
                filterKind: choice('date_range'),
                rangeShape: choice('since'),
                startMonth: choice('m3'),
                startYear: choice('2024'),
                startDay: choice('none'),
            }),
        ).toMatchObject({
            intent: { period: { start: '2024-03-01', end: null } },
        });
        expect(
            ask('before 2023', {
                filterKind: choice('date_range'),
                rangeShape: choice('before'),
                endYear: choice('2023'),
                endMonth: choice('none'),
                endDay: choice('none'),
            }),
        ).toMatchObject({
            intent: { period: { start: null, end: '2023-01-01' } },
        });
    });

    it('puts a yearless range in the latest year that is not in the future', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
        expect(
            ask('may 13 to 20', {
                filterKind: choice('date_range'),
                rangeShape: choice('between'),
                startDay: choice('13'),
                startMonth: choice('m5'),
                endDay: choice('20'),
                endMonth: choice('m5'),
            }),
        ).toMatchObject({
            intent: {
                period: { start: '2025-05-13', end: '2025-05-21' },
            },
        });
    });

    it('never guesses a range bound it cannot anchor to a month or year', () => {
        expect(
            ask('since the 5th', {
                filterKind: choice('date_range'),
                rangeShape: choice('since'),
                startDay: choice('5'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'filter-range' });
    });

    it('filters a chart metric above a stated amount', () => {
        expect(
            ask('count over 1,000', {
                filterKind: choice('number_threshold'),
                thresholdField: choice('orders_count'),
                comparison: choice('gt'),
                amountLow: choice('1000'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_number',
                fieldId: 'orders_count',
                comparison: 'gt',
                values: [1000],
            },
        });
    });

    it('needs an upper bound above the lower one for between', () => {
        expect(
            ask('count between 50 and 10', {
                filterKind: choice('number_threshold'),
                thresholdField: choice('orders_count'),
                comparison: choice('between'),
                amountLow: choice('50'),
                amountHigh: choice('10'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'filter-threshold' });
    });
});

describe('yes/no, text and blank filters', () => {
    const typed = structuredClone(explore);
    Object.assign(typed.tables.orders.dimensions, {
        is_paid: dimension('is_paid', DimensionType.BOOLEAN, 'Is paid'),
    });
    const ask = (prompt: string, answers: Partial<DecisionAnswers>) =>
        interpretChartIntent({
            answers: {
                multiple: noul(0.05),
                nonEdit: noul(0.05),
                intent: choice('filter'),
                ...answers,
            } as DecisionAnswers,
            prompt,
            context: buildChartIntentContext({
                filterRules: [],
                prompt,
                artifact,
                explore: typed,
                usage: noUsage,
            }),
        });

    it('reads words and quoted phrases as text candidates', () => {
        expect(
            extractTextCandidates('remove "Acme Test" or DEMO, ending .edu'),
        ).toEqual([
            'Acme Test',
            'remove',
            'Acme',
            'Test',
            'or',
            'DEMO',
            'ending',
            '.edu',
        ]);
    });

    it('filters a yes/no field JEV picks', () => {
        expect(
            ask('only paid ones', {
                filterKind: choice('yes_no'),
                booleanField: choice('orders_is_paid'),
                booleanValue: choice('true'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_boolean',
                fieldId: 'orders_is_paid',
                value: true,
            },
        });
    });

    it('excludes two texts JEV picks from the prompt', () => {
        expect(
            ask('remove cities with TEST or DEMO in the name', {
                filterKind: choice('text_match'),
                valueFilterField: choice('orders_city'),
                matchMode: choice('contains'),
                matchText: choice('TEST'),
                matchTextAlso: choice('DEMO'),
                excludeMatches: noul(0.9),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_text',
                fieldId: 'orders_city',
                mode: 'contains',
                exclude: true,
                values: ['TEST', 'DEMO'],
            },
        });
    });

    it('leaves excluded prefixes to the agent', () => {
        expect(
            ask('drop cities starting with new', {
                filterKind: choice('text_match'),
                valueFilterField: choice('orders_city'),
                matchMode: choice('starts_with'),
                matchText: choice('new'),
                excludeMatches: noul(0.9),
            }),
        ).toEqual({ type: 'unresolved', reason: 'filter-text' });
    });

    it('removes empty values of the field JEV picks', () => {
        expect(
            ask('remove rows without a region', {
                filterKind: choice('blank'),
                filterField: choice('orders_region'),
                blankMode: choice('not_blank'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'filter_blank',
                fieldId: 'orders_region',
                blank: false,
            },
        });
    });
});

describe('isChartEditAttempt', () => {
    it.each<[ChartIntentResolution, boolean]>([
        [{ type: 'intent', intent: { kind: 'undo' } }, true],
        [
            {
                type: 'needs_values',
                filter: {
                    fieldId: 'a',
                    exclude: false,
                    alternativeFieldIds: [],
                },
            },
            true,
        ],
        [{ type: 'unresolved', reason: 'add-field' }, true],
        [{ type: 'unresolved', reason: 'intent' }, false],
        [{ type: 'unresolved', reason: 'multiple' }, false],
        [{ type: 'unresolved', reason: 'non-edit' }, false],
        [{ type: 'compound', steps: [] }, true],
        [{ type: 'clarify', question: 'Which?', options: [] }, true],
        [{ type: 'unresolved', reason: 'decision-unavailable' }, false],
        [{ type: 'unresolved', reason: 'not-covered' }, true],
        [{ type: 'unresolved', reason: 'verify-unavailable' }, true],
        [{ type: 'not_an_edit' }, false],
    ])('%j -> %s', (resolution, expected) => {
        expect(isChartEditAttempt(resolution)).toBe(expected);
    });
});

describe('buildChartIntentContext', () => {
    it('offers the chart filters as removal options only when there are some', () => {
        const questionsFor = (filterRules: ChartFilterRule[]) =>
            buildChartIntentQuestions({
                prompt: 'show everything again',
                context: buildChartIntentContext({
                    filterRules,
                    prompt: 'show everything again',
                    artifact,
                    explore,
                    usage: noUsage,
                }),
            });
        const region = {
            fieldId: 'orders_region',
            operator: 'equals',
            values: ['North'],
        };
        expect(questionsFor([]).removeFilterField).toBeUndefined();
        expect(questionsFor([region]).removeFilterField).toMatchObject({
            type: 'choice',
            criteria: {
                orders_region: 'Region (Orders)',
                none: expect.any(String),
            },
        });
    });

    it('offers only unselected visible dimensions as addable fields', () => {
        const context = buildChartIntentContext({
            filterRules: [],
            prompt: 'segment by region',
            artifact,
            explore,
            usage: noUsage,
        });
        expect(context.addableFields.map(({ id }) => id)).toEqual([
            'orders_region',
            'orders_city',
        ]);
        expect(context.currentFields.map(({ id }) => id)).toEqual([
            'orders_date',
            'orders_status',
            'orders_count',
        ]);
    });

    it('caps large explores while keeping fields that overlap the prompt', () => {
        const extra = Array.from({ length: 120 }, (_, index) => ({
            id: `other_field_${index}`,
            label: `Field ${index}`,
            table: 'Other',
            description: null,
            isDate: false,
            verifiedUsage: 0,
            chartUsage: 0,
        }));
        const context = buildChartIntentContext({
            filterRules: [],
            prompt: 'segment by warehouse zone',
            artifact,
            explore,
            usage: noUsage,
            extraAddableFields: [
                ...extra,
                {
                    id: 'other_warehouse_zone',
                    label: 'Warehouse zone',
                    table: 'Other',
                    description: null,
                    isDate: false,
                    verifiedUsage: 0,
                    chartUsage: 0,
                },
            ],
        });
        expect(context.addableFields).toHaveLength(80);
        expect(context.addableFields[0].id).toBe('other_warehouse_zone');
    });
});

describe('extractNumberCandidates', () => {
    it('reads digits and number words', () => {
        expect(extractNumberCandidates('top five of the last 30 days')).toEqual(
            [30, 5],
        );
    });
});

describe('decideTurn', () => {
    it('asks only the routing question outside chart threads', async () => {
        const evaluate = vi.fn().mockResolvedValue({ simple: noul(0.9) });
        const { decision } = await decideTurn({
            decisions: { evaluate },
            prompt: 'how many orders so far?',
            instructions: null,
            conversation: [],
            context: null,
        });
        expect(decision).toEqual({
            simpleDataAnswer: true,
            chart: null,
            instantReply: null,
            correction: null,
        });
        expect(evaluate).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'model-routing',
                questions: {
                    simple: expect.anything(),
                    instantReply: expect.anything(),
                    englishPrompt: expect.anything(),
                    lastingCorrection: expect.anything(),
                },
            }),
        );
    });

    it('answers a confident English acknowledgement without the agent', async () => {
        const routing = (answers: Record<string, unknown>) =>
            decideTurn({
                decisions: { evaluate: vi.fn().mockResolvedValue(answers) },
                prompt: 'perfect, thanks!',
                instructions: null,
                conversation: [],
                context: null,
            });
        expect(
            (
                await routing({
                    simple: noul(0.1),
                    instantReply: choice('acknowledgement'),
                    englishPrompt: noul(0.95),
                })
            ).decision.instantReply,
        ).toBe('acknowledgement');
        expect(
            (
                await routing({
                    simple: noul(0.1),
                    instantReply: choice('acknowledgement'),
                    englishPrompt: noul(0.1),
                })
            ).decision.instantReply,
        ).toBeNull();
        expect(
            (
                await routing({
                    simple: noul(0.1),
                    instantReply: choice('acknowledgement', 0.6),
                    englishPrompt: noul(0.95),
                })
            ).decision.instantReply,
        ).toBeNull();
    });

    it('never answers instantly when the turn is a chart edit', async () => {
        const { decision } = await decideTurn({
            decisions: {
                evaluate: vi
                    .fn()
                    .mockResolvedValueOnce({
                        intent: choice('chart_type'),
                        multiple: noul(0.05),
                        nonEdit: noul(0.05),
                        chartType: choice('line'),
                        simple: noul(0.1),
                        instantReply: choice('acknowledgement'),
                        englishPrompt: noul(0.95),
                    })
                    .mockResolvedValueOnce({ covers: noul(0.95) }),
            },
            prompt: 'great, as a line',
            instructions: null,
            conversation: [],
            context: buildChartIntentContext({
                filterRules: [],
                prompt: 'great, as a line',
                artifact,
                explore,
                usage: noUsage,
            }),
        });
        expect(decision.instantReply).toBeNull();
    });

    it('batches routing and chart questions into one request on chart threads', async () => {
        const evaluate = vi.fn().mockResolvedValue({
            intent: choice('chart_type'),
            multiple: noul(0.05),
            nonEdit: noul(0.05),
            chartType: choice('line'),
            simple: noul(0.95),
            covers: noul(0.95),
        });
        const { decision } = await decideTurn({
            decisions: { evaluate },
            prompt: 'as a line',
            instructions: null,
            conversation: [],
            context: buildChartIntentContext({
                filterRules: [],
                prompt: 'as a line',
                artifact,
                explore,
                usage: noUsage,
            }),
        });
        // One batched decision, then one coverage check before acting.
        expect(evaluate).toHaveBeenCalledTimes(2);
        expect(evaluate.mock.calls[1][0].state.plannedChange).toBe(
            'Show the same data as a line chart',
        );
        expect(Object.keys(evaluate.mock.calls[0][0].questions)).toEqual(
            expect.arrayContaining([
                'intent',
                'multiple',
                'simple',
                'addField',
                'sortField',
                'filterField',
            ]),
        );
        expect(decision).toEqual({
            simpleDataAnswer: false,
            instantReply: null,
            correction: null,
            chart: {
                type: 'intent',
                intent: { kind: 'chart_type', chartType: 'line' },
            },
        });
    });

    it('hands a partial plan to the agent', async () => {
        const evaluate = vi
            .fn()
            .mockResolvedValueOnce({
                intent: choice('chart_type'),
                multiple: noul(0.05),
                nonEdit: noul(0.05),
                chartType: choice('bar'),
                simple: noul(0.1),
            })
            .mockResolvedValueOnce({ covers: noul(0.2) });
        const { decision } = await decideTurn({
            decisions: { evaluate },
            prompt: 'stacked 100% bars',
            instructions: null,
            conversation: [],
            context: buildChartIntentContext({
                filterRules: [],
                prompt: 'stacked 100% bars',
                artifact,
                explore,
                usage: noUsage,
            }),
        });
        expect(decision.chart).toEqual({
            type: 'unresolved',
            reason: 'not-covered',
        });
        expect(isChartEditAttempt(decision.chart!)).toBe(true);
        expect(decision.simpleDataAnswer).toBe(false);
    });

    it('keeps a chart edit for the agent when verification is unavailable', async () => {
        const evaluate = vi
            .fn()
            .mockResolvedValueOnce({
                intent: choice('chart_type'),
                multiple: noul(0.05),
                nonEdit: noul(0.05),
                chartType: choice('bar'),
                simple: noul(0.9),
            })
            .mockResolvedValueOnce(null);
        const { decision } = await decideTurn({
            decisions: { evaluate },
            prompt: 'as bars',
            instructions: null,
            conversation: [],
            context: buildChartIntentContext({
                filterRules: [],
                prompt: 'as bars',
                artifact,
                explore,
                usage: noUsage,
            }),
        });
        expect(decision).toEqual({
            simpleDataAnswer: false,
            instantReply: null,
            correction: null,
            chart: { type: 'unresolved', reason: 'verify-unavailable' },
        });
        expect(isChartEditAttempt(decision.chart!)).toBe(true);
    });

    it('falls back to the agent when JEV is unavailable', async () => {
        const { decision } = await decideTurn({
            decisions: { evaluate: vi.fn().mockResolvedValue(null) },
            prompt: 'as a line',
            instructions: null,
            conversation: [],
            context: buildChartIntentContext({
                filterRules: [],
                prompt: 'as a line',
                artifact,
                explore,
                usage: noUsage,
            }),
        });
        expect(decision).toEqual({
            simpleDataAnswer: false,
            instantReply: null,
            correction: null,
            chart: { type: 'unresolved', reason: 'decision-unavailable' },
        });
    });
});

describe('selectFilterValues', () => {
    it('keeps every candidate value JEV selects', async () => {
        const evaluate = vi.fn().mockResolvedValue({
            value0: noul(0.95),
            value1: noul(0.1),
            value2: noul(0.9),
        });
        await expect(
            selectFilterValues({
                decisions: { evaluate },
                prompt: 'just shipped and completed',
                filter: {
                    fieldId: 'orders_status',
                    exclude: false,
                    alternativeFieldIds: [],
                },
                fieldLabel: 'Status',
                candidates: ['shipped', 'placed', 'completed'],
            }),
        ).resolves.toEqual(['shipped', 'completed']);
    });

    it('returns null when nothing matches', async () => {
        await expect(
            selectFilterValues({
                decisions: {
                    evaluate: vi.fn().mockResolvedValue({ value0: noul(0.1) }),
                },
                prompt: 'only the website ones',
                filter: {
                    fieldId: 'orders_status',
                    exclude: false,
                    alternativeFieldIds: [],
                },
                fieldLabel: 'Status',
                candidates: ['placed'],
            }),
        ).resolves.toBeNull();
    });
});
