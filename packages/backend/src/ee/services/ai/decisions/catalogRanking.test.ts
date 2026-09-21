import { JoinRelationship, type Explore } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { executeGrepFields } from '../tools/grepFields';
import { buildFieldIndex } from '../tools/grepFieldsIndex';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getAgentQuestion } from './agentQuestion';
import { AiDecisionClient } from './AiDecisionClient';
import { rankCatalog } from './catalogRanking';

const createDecisions = (scores: Record<string, number | undefined> | null) => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    const evaluate = vi
        .spyOn(decisions, 'evaluate')
        .mockImplementation(async ({ questions }) => {
            if (scores === null) return null;
            return Object.fromEntries(
                Object.entries(questions).map(([key, question]) => {
                    if (question.type !== 'choice')
                        return [
                            key,
                            {
                                type: 'noul' as const,
                                noul: scores[key] ?? 0.1,
                            },
                        ];
                    const options = Object.keys(question.criteria);
                    const choice = options.reduce((best, option) =>
                        (scores[option] ?? 0.1) > (scores[best] ?? 0.1)
                            ? option
                            : best,
                    );
                    const selected = scores[choice] ?? 0.1;
                    return [
                        key,
                        {
                            type: 'choice' as const,
                            choice,
                            confidence: selected,
                            probabilities: Object.fromEntries(
                                options.map((option) => [
                                    option,
                                    option === choice
                                        ? selected
                                        : (scores[option] ?? 0),
                                ]),
                            ),
                        },
                    ];
                }),
            );
        });
    return { decisions, evaluate };
};
const joinedExplore: Explore = {
    ...validExplore,
    name: 'joined_explore',
    baseTable: 'b',
    joinedTables: [
        {
            ...validExplore.joinedTables[0],
            table: 'a',
            relationship: JoinRelationship.MANY_TO_ONE,
        },
    ],
};
const explores = [validExplore, joinedExplore];
const fields = buildFieldIndex(explores);
const noFts: FindExploresFn = vi
    .fn()
    .mockResolvedValue({ topMatchingFields: [] });

describe('catalog discovery ranking', () => {
    it('bundles authoritative metadata with fast field search without changing the structured contract', async () => {
        const { decisions } = createDecisions({ field_0: 0.99 });
        const dependencies = {
            decisions,
            userQuestion: 'met1',
            availableExplores: explores,
            verifiedFieldUsage: new Map<string, number>(),
            findExplores: noFts,
            projectParameterDefinitions: {},
        };
        const fast = await executeGrepFields(
            { patterns: ['met1'], exploreName: validExplore.name },
            dependencies,
        );
        const legacy = await executeGrepFields(
            { patterns: ['met1'], exploreName: validExplore.name },
            { ...dependencies, decisions: undefined },
        );
        expect(fast.result).toContain('Preloaded catalog metadata');
        expect(fast.result).toContain(`Explore: ${validExplore.name}`);
        expect(legacy.result).not.toContain('Preloaded catalog metadata');
        expect(fast.structuredContent).toEqual(legacy.structuredContent);
    });

    it('checks time ambiguity in the same bounded ranking call', async () => {
        const { decisions, evaluate } = createDecisions({
            timeAmbiguous: 0.98,
        });
        const result = await rankCatalog({
            decisions,
            query: 'Revenue recently',
            fields,
            explores,
        });
        expect(result.timeAmbiguous).toBe(true);
        expect(result.ambiguous).toBe(false);
        expect(evaluate).toHaveBeenCalledTimes(1);
    });

    it('carries explicit prior scope, pinned overrides and defaults into follow-up decisions', async () => {
        const { decisions, evaluate } = createDecisions({
            timeAmbiguous: 0.01,
        });
        const conversation = {
            messages: [
                { role: 'user' as const, text: 'Revenue in January 2024' },
                {
                    role: 'user' as const,
                    text: 'Pinned chart runtime date zoom: 2024-01-01 through 2024-01-31',
                },
            ],
            instruction: 'Use calendar months.',
            compactionSummary: null,
            incomplete: false,
        };
        const result = await rankCatalog({
            decisions,
            query: 'And by region?',
            fields,
            explores,
            conversation,
        });
        expect(result.timeAmbiguous).toBe(false);
        expect(evaluate.mock.calls[0][0].state).toMatchObject({ conversation });
    });

    it('does not demand clarification when relevant earlier context was omitted', async () => {
        const { decisions } = createDecisions({
            ambiguous: 0.99,
            timeAmbiguous: 0.99,
        });
        const result = await rankCatalog({
            decisions,
            query: 'Same metric recently',
            fields,
            explores,
            conversation: {
                messages: [],
                instruction: null,
                compactionSummary: null,
                incomplete: true,
            },
        });
        expect(result.ambiguous).toBeNull();
        expect(result.timeAmbiguous).toBeNull();
    });

    it('returns time guidance through grep without changing the tool contract or query', async () => {
        const { decisions } = createDecisions({ timeAmbiguous: 0.99 });
        const result = await executeGrepFields(
            { patterns: ['met1'], exploreName: null },
            {
                decisions,
                userQuestion: 'Revenue recently',
                availableExplores: explores,
                verifiedFieldUsage: new Map(),
                findExplores: noFts,
            },
        );
        expect(result.result).toContain(
            'requested time period may be unresolved',
        );
        expect(result.result).toContain(
            'pinned content and its runtime filters',
        );
        expect(result.structuredContent.patterns[0].pattern).toBe('met1');
    });

    it('keeps the full long request with the main agent instead of ranking a truncated question', async () => {
        const { decisions, evaluate } = createDecisions({
            timeAmbiguous: 0.99,
        });
        const result = await rankCatalog({
            decisions,
            query: 'x'.repeat(8_001),
            fields,
            explores,
        });
        expect(result.timeAmbiguous).toBeNull();
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('ranks field meaning and explore grain together, preserving every reachable field', async () => {
        const { decisions, evaluate } = createDecisions({
            field_1: 0.98,
            explore_1: 0.96,
        });
        const result = await rankCatalog({
            decisions,
            query: 'Revenue by region',
            fields,
            explores,
        });
        expect(evaluate).toHaveBeenCalledTimes(1);
        expect(evaluate.mock.calls[0][0].questions.explore).toMatchObject({
            type: 'choice',
        });
        expect(result.fields[0].path).toBe('valid_explore/a_met1');
        expect(result.fields[1].path).toBe('joined_explore/a_met1');
        expect(result.explores[0].name).toBe('joined_explore');
        expect(new Set(result.fields)).toEqual(new Set(fields));
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            fields: [
                { id: 'a_dim1:dimension' },
                { id: 'a_met1:metric' },
                { id: 'b_dim1:dimension' },
            ],
            explores: [
                { baseTable: 'a' },
                {
                    baseTable: 'b',
                    joins: [{ table: 'a', relationship: 'many-to-one' }],
                },
            ],
        });
    });

    it('accepts a separated explore choice when a strong field decision corroborates it', async () => {
        const { decisions } = createDecisions({
            field_0: 0.94,
            explore_0: 0.68,
            explore_1: 0.2,
        });
        const result = await rankCatalog({
            decisions,
            query: 'Dimension one by entity',
            fields,
            explores,
        });
        expect(result.exploresRanked).toBe(true);
        expect(result.explores[0].name).toBe(validExplore.name);
    });

    it('keeps explore order when a weak choice lacks a clear margin', async () => {
        const { decisions } = createDecisions({
            field_0: 0.7,
            explore_0: 0.62,
            explore_1: 0.45,
        });
        const result = await rankCatalog({
            decisions,
            query: 'Dimension one by entity',
            fields,
            explores,
        });
        expect(result.exploresRanked).toBe(false);
        expect(result.explores).toEqual(explores);
    });

    it('prefers the unique base explore that owns the strongest relevant field', async () => {
        const { decisions } = createDecisions({
            field_0: 0.96,
            explore_0: 0.45,
            none: 0.5,
        });
        const result = await rankCatalog({
            decisions,
            query: 'Dimension one by entity',
            fields,
            explores,
        });
        expect(result.exploresRanked).toBe(true);
        expect(result.explores[0].name).toBe(validExplore.name);
    });

    it.each([
        null,
        {},
        { field_0: 0.7, explore_1: 0.7 },
        {
            field_0: 0.9,
            field_1: 0.9,
            field_2: 0.9,
            explore_0: 0.9,
            explore_1: 0.9,
        },
    ])(
        'preserves stable ordering for outage, uncertainty and equal scores: %j',
        async (scores) => {
            const { decisions } = createDecisions(scores);
            const result = await rankCatalog({
                decisions,
                query: 'Revenue by region',
                fields,
                explores,
            });
            expect(result.fields).toEqual(fields);
            expect(result.explores).toEqual(explores);
        },
    );

    it('budgets at most 43 decisions and retains unscored candidates', async () => {
        const { decisions, evaluate } = createDecisions({ field_0: 0.99 });
        const largeExplores = Array.from({ length: 80 }, (_, i) => ({
            ...validExplore,
            name: `explore_${i}`,
        }));
        const largeFields = Array.from({ length: 80 }, (_, i) => ({
            ...fields[0],
            path: `explore_${i}/a_field_${i}`,
            exploreName: `explore_${i}`,
        }));
        const result = await rankCatalog({
            decisions,
            query: 'Revenue',
            fields: largeFields,
            explores: largeExplores,
        });
        expect(Object.keys(evaluate.mock.calls[0][0].questions)).toHaveLength(
            43,
        );
        expect(result.fields).toHaveLength(80);
        expect(result.explores).toHaveLength(80);
    });

    it('renders ranked fields and explores consistently in grep text and structured results', async () => {
        const { decisions } = createDecisions({
            field_1: 0.99,
            explore_1: 0.98,
        });
        const result = await executeGrepFields(
            { patterns: ['dim1|met1'], exploreName: null },
            {
                decisions,
                userQuestion: 'Revenue by region',
                availableExplores: explores,
                verifiedFieldUsage: new Map(),
                findExplores: noFts,
            },
        );
        const groups = result.structuredContent.patterns[0].resultsByExplore;
        expect(groups[0].exploreName).toBe('joined_explore');
        expect(groups[0].fields[0].fieldId).toBe('a_met1');
        expect(result.result.indexOf('joined_explore (')).toBeLessThan(
            result.result.indexOf('valid_explore ('),
        );
        expect(result.result.indexOf('joined_explore/a_met1')).toBeLessThan(
            result.result.indexOf('joined_explore/a_dim1'),
        );
    });

    it('keeps an explicit explore scope and rejects hidden or unavailable FTS suggestions', async () => {
        const scoped = structuredClone(validExplore);
        scoped.tables.a.dimensions.dim1.hidden = true;
        const { decisions, evaluate } = createDecisions({ field_0: 0.99 });
        const findExplores: FindExploresFn = vi.fn().mockResolvedValue({
            topMatchingFields: [
                { tableName: 'a', name: 'dim1', label: 'Hidden field' },
                {
                    tableName: 'private',
                    name: 'salary',
                    label: 'Unavailable field',
                },
            ],
        });
        const result = await executeGrepFields(
            { patterns: ['met1'], exploreName: validExplore.name },
            {
                decisions,
                userQuestion: 'Revenue',
                availableExplores: [scoped, joinedExplore],
                verifiedFieldUsage: new Map(),
                findExplores,
            },
        );
        expect(result.result).not.toContain('Hidden field');
        expect(result.result).not.toContain('Unavailable field');
        expect(result.structuredContent.fuzzyMatches).toEqual([]);
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            explores: [{ name: validExplore.name }],
        });
        expect(JSON.stringify(evaluate.mock.calls[0][0].state)).not.toContain(
            'joined_explore',
        );
    });

    it('keeps different definitions of the same field id distinct', async () => {
        const changed = structuredClone(joinedExplore);
        changed.tables.a.metrics.met1.description =
            'A different measure at a different grain';
        const { decisions, evaluate } = createDecisions({ field_3: 0.99 });
        const result = await rankCatalog({
            decisions,
            query: 'Revenue',
            fields: buildFieldIndex([validExplore, changed]),
            explores: [validExplore, changed],
        });
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            fields: [
                { id: 'a_dim1:dimension' },
                { id: 'a_met1:metric' },
                { id: 'b_dim1:dimension' },
                {
                    id: 'a_met1:metric',
                    description: 'A different measure at a different grain',
                },
            ],
        });
        expect(result.fields[0].exploreName).toBe(changed.name);
    });

    it('keeps each pattern locality order when relevance scores tie', async () => {
        const catalog = structuredClone(validExplore);
        catalog.tables.a.dimensions.dim1.label = 'order';
        catalog.tables.a.dimensions.dim1.description = 'revenue';
        catalog.tables.b.dimensions.dim1.label = 'revenue';
        catalog.tables.b.dimensions.dim1.description = 'order';
        const { decisions } = createDecisions({ field_0: 0.9, field_1: 0.9 });
        const result = await executeGrepFields(
            { patterns: ['order', 'revenue'], exploreName: null },
            {
                decisions,
                availableExplores: [catalog],
                verifiedFieldUsage: new Map(),
                findExplores: noFts,
            },
        );
        expect(
            result.structuredContent.patterns[0].resultsByExplore[0].fields[0]
                .fieldId,
        ).toBe('a_dim1');
        expect(
            result.structuredContent.patterns[1].resultsByExplore[0].fields[0]
                .fieldId,
        ).toBe('b_dim1');
    });

    it('ranks authorized fuzzy matches even when no literal fields match', async () => {
        const { decisions } = createDecisions({ field_1: 0.99 });
        const findExplores: FindExploresFn = vi.fn().mockResolvedValue({
            topMatchingFields: [
                {
                    tableName: 'a',
                    name: 'dim1',
                    label: 'First',
                    fieldType: 'dimension',
                    verifiedChartUsage: 2,
                },
                {
                    tableName: 'a',
                    name: 'met1',
                    label: 'Relevant',
                    fieldType: 'metric',
                    verifiedChartUsage: 0,
                },
            ],
        });
        const result = await executeGrepFields(
            { patterns: ['synonym'], exploreName: null },
            {
                decisions,
                availableExplores: [validExplore],
                verifiedFieldUsage: new Map(),
                findExplores,
            },
        );
        expect(result.structuredContent.fuzzyMatches[0].fieldId).toBe('a_met1');
        expect(result.result.indexOf('a_met1')).toBeLessThan(
            result.result.indexOf('a_dim1'),
        );
    });

    it('does not let attached user-role context replace the actual question', () => {
        expect(
            getAgentQuestion({
                userQuestion: 'Revenue by region',
                messageHistory: [
                    { role: 'user', content: 'Attached chart context' },
                ],
            }),
        ).toBe('Revenue by region');
        expect(
            getAgentQuestion({
                messageHistory: [
                    { role: 'user', content: 'Revenue by region' },
                ],
            }),
        ).toBe('Revenue by region');
    });
});
