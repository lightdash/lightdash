import {
    DimensionType,
    FilterOperator,
    TimeFrames,
    toolRunQueryArgsSchemaTransformed,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import { prepareDateCheck } from './dateChecks';
import { checkQueryIntent } from './queryChecks';

const explore: Explore = {
    ...validExplore,
    tables: {
        ...validExplore.tables,
        a: {
            ...validExplore.tables.a,
            dimensions: {
                date: {
                    ...validExplore.tables.a.dimensions.dim1,
                    name: 'date',
                    type: DimensionType.DATE,
                    label: 'Order date',
                },
                timestamp: {
                    ...validExplore.tables.a.dimensions.dim1,
                    name: 'timestamp',
                    type: DimensionType.TIMESTAMP,
                },
                month: {
                    ...validExplore.tables.a.dimensions.dim1,
                    name: 'month',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.MONTH,
                },
            },
        },
    },
};
const choice = (
    value: string,
    probability = 0.99,
): DecisionAnswers[string] => ({
    type: 'choice',
    choice: value,
    confidence: probability,
    probabilities: { [value]: probability },
});
const answers: DecisionAnswers = {
    datePeriod: choice('0'),
    dateField: choice('a_date'),
    dateScopeInDefinitions: { type: 'noul', noul: 0.01 },
};
const query = toolRunQueryArgsSchemaTransformed.parse({
    title: 'Orders',
    description: '',
    chartConfig: null,
    queryConfig: {
        exploreName: explore.name,
        dimensions: ['a_date'],
        metrics: ['a_met1'],
        sorts: [],
        limit: null,
        filters: null,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
    },
});

query.queryConfig.filters = {
    dimensions: {
        id: 'root',
        and: [
            {
                id: 'date',
                target: { fieldId: 'a_date' },
                operator: FilterOperator.IN_BETWEEN,
                values: ['2024-02-01', '2024-02-28'],
            },
        ],
    },
};

describe('date source selection and query review', () => {
    it('uses one provider call for semantic and deterministic date review', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        const evaluate = vi
            .spyOn(decisions, 'evaluate')
            .mockResolvedValue(answers);
        const before = structuredClone(query);
        const advice = await checkQueryIntent({
            decisions,
            question: 'Orders in February 2024',
            query,
            explore,
        });
        expect(advice).toEqual([
            expect.stringContaining('do not cover exactly "February 2024"'),
        ]);
        expect(evaluate).toHaveBeenCalledTimes(1);
        expect(Object.keys(evaluate.mock.calls[0][0].questions)).toHaveLength(
            8,
        );
        expect(query).toEqual(before);
    });
    it('passes prior user scope into selection and compares a continued period', async () => {
        const conversation = {
            messages: [
                { role: 'user' as const, text: 'Orders in February 2024' },
            ],
            instruction: null,
            compactionSummary: null,
            incomplete: false,
        };
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        const evaluate = vi
            .spyOn(decisions, 'evaluate')
            .mockResolvedValue(answers);
        const advice = await checkQueryIntent({
            decisions,
            question: 'And by customer?',
            query,
            explore,
            conversation,
        });
        expect(advice[0]).toContain('Earlier user message');
        expect(evaluate.mock.calls[0][0].state).toMatchObject({ conversation });
    });
    it('does not split choice confidence between the latest question and its history copy', () => {
        const question = 'Orders in February 2024';
        const prepared = prepareDateCheck({
            question,
            explore,
            conversation: {
                messages: [{ role: 'user', text: question }],
                instruction: null,
                compactionSummary: null,
                incomplete: false,
            },
        });
        const choiceQuestion = prepared?.questions.datePeriod;
        expect(
            choiceQuestion?.type === 'choice'
                ? Object.keys(choiceQuestion.criteria)
                : [],
        ).toEqual(['0', 'none']);
    });
    it('collapses equivalent date candidates across differently worded turns', () => {
        const prepared = prepareDateCheck({
            question: 'Keep February 2024 and group by customer',
            explore,
            conversation: {
                messages: [
                    { role: 'user', text: 'Count orders in February 2024' },
                ],
                instruction: null,
                compactionSummary: null,
                incomplete: false,
            },
        });
        const choiceQuestion = prepared?.questions.datePeriod;
        expect(
            choiceQuestion?.type === 'choice'
                ? Object.keys(choiceQuestion.criteria)
                : [],
        ).toEqual(['0', 'none']);
    });
    it.each([
        { ...answers, datePeriod: choice('none') },
        { ...answers, datePeriod: choice('0', 0.94) },
        { ...answers, dateField: choice('a_date', 0.94) },
        { ...answers, dateField: choice('unknown_date') },
        { ...answers, dateField: choice('a_month') },
        { ...answers, dateField: choice('a_timestamp') },
        { ...answers, datePeriod: choice('200') },
        { ...answers, dateScopeInDefinitions: { type: 'noul', noul: 0.16 } },
        { ...answers, dateScopeInDefinitions: { type: 'noul', noul: 0.99 } },
        {},
    ])(
        'abstains on uncertain, unsupported or unavailable mappings %#',
        (result) => {
            const prepared = prepareDateCheck({
                question: 'Orders in February 2024',
                explore,
            });
            expect(prepared?.advice(result, query.queryConfig.filters)).toEqual(
                [],
            );
        },
    );
    it('does not flag matching dates or imply verified prose', () => {
        const prepared = prepareDateCheck({
            question: 'Orders from 2024-02-01 through 2024-02-28 inclusive',
            explore,
        });
        expect(prepared?.advice(answers, query.queryConfig.filters)).toEqual(
            [],
        );
    });
    it('abstains when a derived or different date field also restricts the query', () => {
        const prepared = prepareDateCheck({
            question: 'Orders in February 2024',
            explore,
        });
        expect(
            prepared?.advice(answers, {
                dimensions: {
                    id: 'and',
                    and: [
                        {
                            id: 'month',
                            target: { fieldId: 'a_month' },
                            operator: FilterOperator.EQUALS,
                            values: ['2024-02-01'],
                        },
                    ],
                },
            }),
        ).toEqual([]);
    });
    it('still reviews the active date when a different date filter is disabled', () => {
        const prepared = prepareDateCheck({
            question: 'Orders in February 2024',
            explore,
        });
        expect(
            prepared?.advice(answers, {
                dimensions: {
                    id: 'and',
                    and: [
                        {
                            id: 'month',
                            target: { fieldId: 'a_month' },
                            operator: FilterOperator.EQUALS,
                            values: ['2024-02-01'],
                            disabled: true,
                        },
                    ],
                },
            }),
        ).toEqual([expect.stringContaining('do not cover exactly')]);
    });
    it('disables date decisions when relevant context was omitted or no period is parsed', () => {
        expect(
            prepareDateCheck({ question: 'Revenue by region', explore }),
        ).toBeNull();
        expect(
            prepareDateCheck({
                question: 'Revenue in February 2024',
                explore,
                conversation: {
                    messages: [],
                    instruction: null,
                    compactionSummary: null,
                    incomplete: true,
                },
            }),
        ).toBeNull();
    });
    it('returns normal query behavior on provider outage', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        expect(
            await checkQueryIntent({
                decisions,
                question: 'Orders in February 2024',
                query,
                explore,
            }),
        ).toEqual([]);
    });
});
