import {
    FilterOperator,
    toolRunQueryArgsSchemaTransformed,
} from '@lightdash/common';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { evaluateAgentReadiness } from '../agents/readinessScorer';
import { AiDecisionClient } from './AiDecisionClient';
import { resolveFieldValue } from './fieldValues';
import {
    checkQueryIntent,
    emptyResultGuidance,
    getEmptyFilterHints,
} from './queryChecks';
import { queryErrorOverride } from './queryErrors';
import { rankCandidates } from './rankCandidates';
import { classifyResponseSignals } from './responseSignals';

const noul = (value: number) => ({ type: 'noul', noul: value });
const choice = (value: string) => ({
    type: 'choice',
    choice: value,
    confidence: 0.99,
    probabilities: { [value]: 1 },
});
const client = (answers: Record<string, unknown>) =>
    new AiDecisionClient(
        { apiKey: 'test', model: 'test', timeoutMs: 100 },
        async () => Response.json({ model: 'test', answers }),
    );
const offline = new AiDecisionClient({
    apiKey: null,
    model: 'test',
    timeoutMs: 100,
});
const query = toolRunQueryArgsSchemaTransformed.parse({
    title: 'Orders',
    description: '',
    chartConfig: null,
    queryConfig: {
        exploreName: validExplore.name,
        dimensions: metricQueryMock.dimensions,
        metrics: metricQueryMock.metrics,
        sorts: [],
        limit: null,
        filters: null,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
    },
});

describe('decision fallbacks and invariants', () => {
    it('keeps uncertain response signals unknown for the legacy fallback', async () => {
        expect(
            await classifyResponseSignals(
                client({ blocking: noul(0.5), refused: noul(0.5) }),
                'Choose a period',
            ),
        ).toMatchObject({ needsUserInput: null, refused: null });
        expect(
            await classifyResponseSignals(
                client({ blocking: noul(0.99), refused: noul(0.01) }),
                'Choisissez une période',
            ),
        ).toMatchObject({ needsUserInput: true, refused: false });
        expect(
            await classifyResponseSignals(offline, 'Choose a period'),
        ).toMatchObject({ needsUserInput: null, refused: null });
    });

    it('preserves exact values without a provider and returns only typed catalog values', async () => {
        expect(
            await resolveFieldValue({
                decisions: offline,
                fieldId: 'region',
                requested: 'CA',
                values: ['CA'],
            }),
        ).toBe('CA');
        expect(
            await resolveFieldValue({
                decisions: client({ value: choice('1') }),
                fieldId: 'active',
                requested: 'active',
                values: [false, true],
            }),
        ).toBe(true);
        expect(
            await resolveFieldValue({
                decisions: client({ value: choice('none') }),
                fieldId: 'region',
                requested: 'western Europe',
                values: ['CA'],
            }),
        ).toBeNull();
        expect(
            await resolveFieldValue({
                decisions: client({ value: choice('invalid') }),
                fieldId: 'region',
                requested: 'California',
                values: ['CA'],
            }),
        ).toBeNull();
    });

    it('reranks without dropping candidates and preserves order on ties or outage', async () => {
        const candidates = ['unrelated', 'verified', 'unverified'];
        const args = {
            query: 'revenue',
            candidates,
            describe: (value: string) => value,
            operation: 'test',
        };
        expect(
            (
                await rankCandidates({
                    ...args,
                    decisions: client({
                        fit_0: noul(0.1),
                        fit_1: noul(0.9),
                        fit_2: noul(0.9),
                    }),
                })
            ).candidates,
        ).toEqual(['verified', 'unverified', 'unrelated']);
        expect(
            (await rankCandidates({ ...args, decisions: offline })).candidates,
        ).toEqual(candidates);
    });

    it('only surfaces clear intent mismatches and leaves queries untouched', async () => {
        const before = structuredClone(query);
        const issues = await checkQueryIntent({
            decisions: client({
                measure: noul(0.5),
                conditions: noul(0.99),
                grain: noul(0.1),
                time: noul(0.5),
                ranking: noul(0.01),
            }),
            question: 'Exclude cancelled orders',
            query,
            explore: validExplore,
        });
        expect(issues).toEqual([
            expect.stringContaining('grouping alone does not apply a filter'),
        ]);
        expect(query).toEqual(before);
        expect(
            await checkQueryIntent({
                decisions: offline,
                question: 'Orders',
                query,
                explore: validExplore,
            }),
        ).toEqual([]);
    });

    it('offers equivalent empty-result hints without mutating scope', async () => {
        const filtered = {
            ...query,
            queryConfig: {
                ...query.queryConfig,
                filters: {
                    dimensions: {
                        id: 'and',
                        and: [
                            {
                                id: 'region',
                                target: { fieldId: 'orders_region' },
                                operator: FilterOperator.EQUALS,
                                values: ['California'],
                            },
                        ],
                    },
                },
            },
        };
        const before = structuredClone(filtered);
        const searchFieldValues = vi.fn().mockResolvedValue(['CA', 'NY']);
        expect(
            await getEmptyFilterHints({
                decisions: client({ value: choice('0') }),
                query: filtered,
                searchFieldValues,
            }),
        ).toContain('"CA" is a likely equivalent');
        expect(filtered).toEqual(before);
        expect(emptyResultGuidance(filtered)).toContain(
            'Do not broaden the query',
        );
        searchFieldValues.mockRejectedValue(new Error('denied'));
        expect(
            await getEmptyFilterHints({
                decisions: offline,
                query: filtered,
                searchFieldValues,
            }),
        ).toBe('');
    });

    it('does not retry an unrepairable error or repeatedly classify the same failure', async () => {
        const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
            Response.json({
                model: 'test',
                answers: {
                    category: choice('permissions'),
                    repairable: noul(0.01),
                },
            }),
        );
        const decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            fetcher,
        );
        const args = {
            decisions,
            messages: [
                {
                    role: 'tool' as const,
                    content: [
                        {
                            type: 'tool-result' as const,
                            toolCallId: 'failed',
                            toolName: 'runQuery',
                            output: {
                                type: 'error-text' as const,
                                value: 'Permission denied',
                            },
                        },
                    ],
                },
            ],
            checked: new Map<string, string | null>(),
            allToolNames: ['runQuery', 'findContent'],
        };
        expect(await queryErrorOverride(args)).toMatchObject({
            activeTools: ['findContent'],
        });
        await queryErrorOverride(args);
        expect(
            await queryErrorOverride({
                ...args,
                messages: [
                    {
                        role: 'tool',
                        content: [
                            {
                                type: 'tool-result',
                                toolCallId: 'search',
                                toolName: 'findContent',
                                output: {
                                    type: 'text',
                                    value: 'Found a chart',
                                },
                            },
                        ],
                    },
                ],
            }),
        ).toMatchObject({ activeTools: ['findContent'] });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(
            await queryErrorOverride({
                ...args,
                decisions: offline,
                checked: new Map(),
            }),
        ).toBeNull();
    });

    it('preserves main readiness scores without decisions', async () => {
        const result = await evaluateAgentReadiness(
            new MockLanguageModelV3(),
            [],
            null,
        );
        expect(result.overallScore).toBe(3);
        expect(result.instructionQuality).toEqual({
            score: 3,
            recommendations: [
                'Add agent instructions to guide AI behavior',
                'Include specific explore references in instructions',
            ],
        });
    });

    it('scores actual metadata, with a deterministic fallback for missing instructions', async () => {
        const model = new MockLanguageModelV3();
        const empty = await evaluateAgentReadiness(model, [], null, offline);
        expect(empty.overallScore).toBe(1);
        expect(empty.projectSnapshot).toEqual({
            exploreCount: 0,
            fieldCount: 0,
        });
        const populated = await evaluateAgentReadiness(
            model,
            [validExplore],
            'Use documented metrics',
            client({
                instructionQuality: {
                    type: 'score',
                    score: 3.8,
                    confidence: 0.99,
                },
            }),
        );
        expect(populated.instructionQuality.score).toBe(4.8);
        expect(populated.projectSnapshot.fieldCount).toBeGreaterThan(0);
    });
});
