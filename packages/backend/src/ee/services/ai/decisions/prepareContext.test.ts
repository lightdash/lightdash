import type { ToolSet } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { getLoadAgentTools } from '../tools/loadAgentTools';
import type { AiAgentArgs, AiAgentDependencies } from '../types/aiAgent';
import { AiDecisionClient } from './AiDecisionClient';
import { prepareRelevantContext } from './prepareContext';

const choice = (value: string) => ({
    type: 'choice',
    choice: value,
    confidence: 0.99,
    probabilities: { [value]: 1 },
});
const resourceRuntime = {
    loadSkill: {},
    getKnowledgeDocumentContent: {},
    loadProjectContext: {},
} as unknown as ToolSet;

const setup = (allowlist?: Set<string>) => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () =>
        Response.json({
            model: 'test',
            answers: {
                skill: choice('skill_0'),
                needsSkill: { type: 'noul', noul: 0.99 },
                document_0: { type: 'noul', noul: 0.99 },
            },
        }),
    );
    const args = {
        decisions: new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            request,
        ),
        execution: { mode: 'standard', toolAllowlist: allowlist },
        messageHistory: [
            { role: 'user', content: 'Explain our revenue definition' },
        ],
        projectContextEnabled: false,
        projectContext: [],
        availableSkills: [{ name: 'metrics', description: 'Metrics workflow' }],
        knowledgeDocuments: [
            {
                uuid: 'doc',
                name: 'Revenue',
                summary: {
                    description: 'Metric definition',
                    useWhen: 'Revenue questions',
                },
                content: null,
                alwaysIncludeInContext: false,
            },
        ],
    } as unknown as AiAgentArgs;
    const loadSkill = vi.fn().mockResolvedValue({
        name: 'metrics',
        body: 'Use documented metrics.',
    });
    const getKnowledgeDocumentContent = vi.fn().mockResolvedValue({
        name: 'Revenue',
        content: 'Revenue excludes refunds.',
    });
    const dependencies = {
        loadSkill,
        getKnowledgeDocumentContent,
    } as unknown as AiAgentDependencies;
    return {
        args,
        dependencies,
        request,
        loadSkill,
        getKnowledgeDocumentContent,
    };
};

describe('context preloading', () => {
    it.each([
        [0.99, 'reference_answer'],
        [0.89, null],
        [0.1, null],
    ] as const)(
        'bounds intent routing at %s',
        async (probability, expected) => {
            const { args, dependencies, request } = setup();
            args.availableSkills = [];
            request.mockImplementation(async (_, init) => {
                const body = JSON.parse(init?.body as string);
                expect(body.questions.turnIntent.type).toBe('choice');
                return Response.json({
                    model: 'test',
                    answers: {
                        document_0: { type: 'noul', noul: 0.99 },
                        turnIntent: {
                            type: 'choice',
                            choice: 'reference_answer',
                            confidence: probability,
                            probabilities: {
                                reference_answer: probability,
                                other: 1 - probability,
                            },
                        },
                    },
                });
            });
            const context = await prepareRelevantContext(args, dependencies, {
                ...resourceRuntime,
                loadAgentTools: getLoadAgentTools(),
            });
            expect(context?.turnIntent).toBe(expected);
            expect(request).toHaveBeenCalledTimes(1);
        },
    );

    it.each([
        [
            'narrows tools to the likely turn types',
            { data_answer: 0.6, chart_from_previous: 0.35, other: 0.05 },
            ['data_answer', 'chart_from_previous'],
        ],
        [
            'keeps the full toolbox when another outcome is plausible',
            { data_answer: 0.6, chart_from_previous: 0.1, other: 0.3 },
            [],
        ],
        [
            'keeps the full toolbox when two turn types cover too little',
            { data_answer: 0.45, chart_from_previous: 0.3, chart: 0.25 },
            [],
        ],
    ] as const)(
        '%s when no single turn type is confident',
        async (_, probabilities, expected) => {
            const { args, dependencies, request } = setup();
            args.availableSkills = [];
            args.knowledgeDocuments = [];
            args.messageHistory = [
                { role: 'user', content: 'What is our average cost?' },
                { role: 'assistant', content: 'Which cost do you mean?' },
                { role: 'user', content: 'the operating one' },
            ];
            request.mockResolvedValue(
                Response.json({
                    model: 'test',
                    answers: {
                        turnIntent: {
                            type: 'choice',
                            choice: 'data_answer',
                            confidence: probabilities.data_answer,
                            probabilities,
                        },
                    },
                }),
            );
            const context = await prepareRelevantContext(args, dependencies, {
                loadAgentTools: getLoadAgentTools(),
            });
            expect(context?.turnIntent ?? null).toBeNull();
            expect(context?.toolIntents ?? []).toEqual(expected);
        },
    );

    it('uses a confident Jev route for mixed requests', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [
            {
                role: 'user',
                content:
                    'Show me where the orders metric is defined and create a PR fixing it.',
            },
        ];
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: { turnIntent: choice('repository_change') },
            }),
        );

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('repository_change');
    });

    it('classifies chart content-as-code export as its own route', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [
            {
                role: 'user',
                content: 'Export that chart as content-as-code YAML.',
            },
        ];
        request.mockImplementation(async (_, init) => {
            const body = JSON.parse(init?.body as string);
            expect(body.questions.turnIntent.criteria.chart_export).toContain(
                'content-as-code YAML',
            );
            return Response.json({
                model: 'test',
                answers: { turnIntent: choice('chart_export') },
            });
        });

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('chart_export');
    });

    it.each([
        ['data_app_create', 'Build a new interactive revenue data app.'],
        ['data_app_iterate', 'Update the revenue app with a dark theme.'],
        ['data_app_read', 'Inspect the finished revenue data app.'],
    ] as const)('classifies %s as its own route', async (intent, query) => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [{ role: 'user', content: query }];
        request.mockImplementation(async (_, init) => {
            const body = JSON.parse(init?.body as string);
            expect(body.questions.turnIntent.criteria[intent]).toBeDefined();
            return Response.json({
                model: 'test',
                answers: { turnIntent: choice(intent) },
            });
        });

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
            generateDataApp: {},
            iterateDataApp: {},
            readContent: {},
        } as unknown as ToolSet);
        expect(context?.turnIntent).toBe(intent);
    });

    it('omits disabled data app actions from the classifier', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        request.mockImplementation(async (_, init) => {
            const body = JSON.parse(init?.body as string);
            expect(body.questions.turnIntent.criteria).not.toHaveProperty(
                'data_app_create',
            );
            expect(body.questions.turnIntent.criteria).not.toHaveProperty(
                'data_app_iterate',
            );
            expect(body.questions.turnIntent.criteria).not.toHaveProperty(
                'data_app_read',
            );
            return Response.json({
                model: 'test',
                answers: { turnIntent: choice('other') },
            });
        });

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('other');
    });

    it('classifies a chart conversion follow-up as its own route', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [
            { role: 'user', content: 'How many orders last year?' },
            { role: 'assistant', content: '151 orders.' },
            { role: 'user', content: 'As a line chart.' },
        ];
        request.mockImplementation(async () =>
            Response.json({
                model: 'test',
                answers: { turnIntent: choice('chart_from_previous') },
            }),
        );

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('chart_from_previous');
    });

    it('defines filters as mutations of the preceding chart', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [
            { role: 'user', content: 'Show orders by payment method.' },
            { role: 'assistant', content: 'Created the chart.' },
            { role: 'user', content: 'Show only shipped orders.' },
        ];
        request.mockImplementation(async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            expect(
                body.questions.turnIntent.criteria.chart_from_previous,
            ).toContain('filters');
            expect(body.questions.turnIntent.instructions).toContain(
                'add or remove a filter',
            );
            return Response.json({
                model: 'test',
                answers: { turnIntent: choice('chart_from_previous') },
            });
        });

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('chart_from_previous');
    });

    it('defines a terse correction after a no-row mutation as the same chart route', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [
            { role: 'user', content: 'Show only shipped orders.' },
            {
                role: 'assistant',
                content:
                    'No shipped orders matched. Would you like a different status?',
            },
            { role: 'user', content: 'Yea completed then.' },
        ];
        request.mockImplementation(async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            expect(body.questions.turnIntent.instructions).toContain(
                'a short reply naming that value means replace the attempted filter value',
            );
            expect(
                body.questions.turnIntent.criteria.chart_from_previous,
            ).toContain('no-row chart mutation');
            return Response.json({
                model: 'test',
                answers: { turnIntent: choice('chart_from_previous') },
            });
        });

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('chart_from_previous');
    });

    it('preserves the chart mutation route when the general classifier disagrees', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.forceChartMutationRouting = true;
        args.messageHistory = [
            { role: 'user', content: 'Show orders by payment method.' },
            { role: 'assistant', content: 'Created the chart.' },
            { role: 'user', content: 'Show only shipped orders.' },
        ];
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: { turnIntent: choice('data_answer') },
            }),
        );

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('chart_from_previous');
    });

    it('narrows a low-confidence chart follow-up to the likely chart turn types', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [
            ...Array.from({ length: 8 }, (_, index) => ({
                role: 'user' as const,
                content: `Older question ${index}`,
            })),
            { role: 'user', content: 'Compare 2024 with 2025.' },
            { role: 'assistant', content: '2025 was higher.' },
            { role: 'user', content: 'show that as a line chart' },
        ];
        request.mockImplementation(async () =>
            Response.json({
                model: 'test',
                answers: {
                    turnIntent: {
                        type: 'choice',
                        choice: 'chart_from_previous',
                        confidence: 0.51,
                        probabilities: {
                            chart_from_previous: 0.51,
                            chart: 0.49,
                        },
                    },
                },
            }),
        );

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBeNull();
        expect(context?.toolIntents).toEqual(['chart_from_previous', 'chart']);
    });

    it.each([
        'how many orders 5 years ago?',
        'Show order trends over the last 5 years',
        'Compare order volume by month for 2024 vs 2025',
    ])(
        'does not infer analytical intent from prompt keywords: %s',
        async (query) => {
            const { args, dependencies, request } = setup();
            args.availableSkills = [];
            args.knowledgeDocuments = [];
            args.messageHistory = [{ role: 'user', content: query }];
            request.mockResolvedValue(
                Response.json({
                    model: 'test',
                    answers: {
                        turnIntent: {
                            type: 'choice',
                            choice: 'other',
                            confidence: 0.51,
                            probabilities: { other: 0.51, data_answer: 0.49 },
                        },
                    },
                }),
            );

            const context = await prepareRelevantContext(args, dependencies, {
                loadAgentTools: getLoadAgentTools(),
            });
            expect(context).toBeNull();
        },
    );

    it.each([
        'How many charts are in this project?',
        'What is the definition of total revenue?',
        'Show revenue as a line chart',
    ])(
        'leaves potentially ambiguous analytical wording to Jev: %s',
        async (query) => {
            const { args, dependencies, request } = setup();
            args.availableSkills = [];
            args.knowledgeDocuments = [];
            args.messageHistory = [{ role: 'user', content: query }];
            request.mockResolvedValue(
                Response.json({
                    model: 'test',
                    answers: {
                        turnIntent: {
                            type: 'choice',
                            choice: 'other',
                            confidence: 0.99,
                            probabilities: { other: 1 },
                        },
                    },
                }),
            );

            const context = await prepareRelevantContext(args, dependencies, {
                loadAgentTools: getLoadAgentTools(),
            });
            expect(context?.turnIntent).toBe('other');
        },
    );

    it('keeps the full toolbox when Jev is unavailable', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [];
        args.messageHistory = [
            { role: 'user', content: 'how many orders 5 years ago?' },
        ];
        request.mockRejectedValue(new Error('offline'));

        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context).toBeNull();
    });

    it('retains narrow routing for a self-contained first question with long agent instructions', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.agentSettings = {
            ...args.agentSettings,
            instruction: 'Preserve all business rules. '.repeat(1000),
        };
        args.messageHistory = [
            {
                role: 'user',
                content: 'Which organisation owns this identifier?',
            },
        ];
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: { turnIntent: choice('data_answer') },
            }),
        );
        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('data_answer');
        expect(args.agentSettings.instruction?.length).toBeGreaterThan(4000);
    });

    it('routes presentation follow-ups when only older context was omitted', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.messageHistory = [
            { role: 'user', content: 'Unrelated older history '.repeat(1000) },
            { role: 'user', content: 'Count orders by month for last year' },
            {
                role: 'assistant',
                content: 'January: 12 orders. February: 18 orders.',
            },
            {
                role: 'user',
                content: 'Could you turn those results into bars with a line?',
            },
        ];
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: { turnIntent: choice('chart_from_previous') },
            }),
        );
        const context = await prepareRelevantContext(args, dependencies, {
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBe('chart_from_previous');
    });

    it('never narrows the toolbox when relevant conversation is incomplete', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.messageHistory = [
            { role: 'user', content: 'Unresolved history '.repeat(1000) },
            { role: 'user', content: 'Explain that rule.' },
        ];
        request.mockImplementation(async () =>
            Response.json({
                model: 'test',
                answers: {
                    document_0: { type: 'noul', noul: 0.99 },
                    turnIntent: {
                        type: 'choice',
                        choice: 'reference_answer',
                        confidence: 0.99,
                        probabilities: { reference_answer: 1 },
                    },
                },
            }),
        );
        const context = await prepareRelevantContext(args, dependencies, {
            ...resourceRuntime,
            loadAgentTools: getLoadAgentTools(),
        });
        expect(context?.turnIntent).toBeNull();
    });
    const setupProject = () => {
        const result = setup();
        result.args.availableSkills = [];
        result.args.knowledgeDocuments = [];
        result.args.projectContextEnabled = true;
        result.args.aiAgentMemoryEnabled = false;
        result.args.projectContext = [
            {
                id: 'net-revenue',
                kind: 'definition',
                terms: ['revenue'],
                objects: [
                    { type: 'field', explore: 'orders', fieldId: 'orders_net' },
                ],
                content:
                    'Revenue excludes refunds; include tax only in UK reports.',
            },
            {
                id: 'support',
                kind: 'context',
                terms: ['tickets'],
                objects: [],
                content: 'Support SLAs use business hours.',
            },
        ];
        result.request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: {
                    context_0: { type: 'noul', noul: 0.97 },
                    context_1: { type: 'noul', noul: 0.05 },
                },
            }),
        );
        return result;
    };

    it('preloads complete relevant rules and their object references without loading memory', async () => {
        const { args, dependencies, request } = setupProject();
        const context = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(context?.projectContextEntryIds).toEqual(['net-revenue']);
        expect(context?.content).toContain(args.projectContext[0].content);
        expect(context?.content).toContain('orders_net');
        expect(context?.content).toContain('partial selection');
        expect(context?.content).not.toContain('Support SLAs');
        expect(request).toHaveBeenCalledTimes(1);
        expect(args.aiAgentMemoryEnabled).toBe(false);
    });

    it.each(['disabled', 'restricted', 'missing-runtime'] as const)(
        'does not transmit project rules when access is %s',
        async (reason) => {
            const { args, dependencies, request } = setupProject();
            if (reason === 'disabled') args.projectContextEnabled = false;
            if (reason === 'restricted')
                args.execution = {
                    mode: 'standard',
                    maxSteps: 10,
                    toolAllowlist: new Set(['grepFields']),
                };
            const runtime = reason === 'missing-runtime' ? {} : resourceRuntime;
            expect(
                await prepareRelevantContext(args, dependencies, runtime),
            ).toBeNull();
            expect(request).not.toHaveBeenCalled();
        },
    );

    it('requires the actual skill and document loaders before sending their metadata', async () => {
        const {
            args,
            dependencies,
            request,
            loadSkill,
            getKnowledgeDocumentContent,
        } = setup();
        expect(await prepareRelevantContext(args, dependencies, {})).toBeNull();
        expect(request).not.toHaveBeenCalled();
        expect(loadSkill).not.toHaveBeenCalled();
        expect(getKnowledgeDocumentContent).not.toHaveBeenCalled();
    });

    it.each([0.5, 0.84])(
        'retains on-demand lookup when project relevance is %s',
        async (noul) => {
            const { args, dependencies, request } = setupProject();
            request.mockResolvedValue(
                Response.json({
                    model: 'test',
                    answers: {
                        context_0: { type: 'noul', noul },
                        context_1: { type: 'noul', noul: 0.01 },
                    },
                }),
            );
            expect(
                await prepareRelevantContext(
                    args,
                    dependencies,
                    resourceRuntime,
                ),
            ).toBeNull();
        },
    );

    it('retains on-demand lookup on provider failure without a resource read', async () => {
        const {
            args,
            dependencies,
            request,
            loadSkill,
            getKnowledgeDocumentContent,
        } = setupProject();
        request.mockRejectedValue(new Error('Unavailable'));
        expect(
            await prepareRelevantContext(args, dependencies, resourceRuntime),
        ).toBeNull();
        expect(loadSkill).not.toHaveBeenCalled();
        expect(getKnowledgeDocumentContent).not.toHaveBeenCalled();
    });

    it('includes late keyword matches beyond six query terms and caps selected context at five', async () => {
        const { args, dependencies, request } = setupProject();
        args.messageHistory = [
            {
                role: 'user',
                content:
                    'Explain monthly international consolidated estimated current customer revenue',
            },
        ];
        args.projectContext = [
            ...Array.from({ length: 40 }, (_, i) => ({
                ...args.projectContext[1],
                id: `unrelated-${i}`,
            })),
            args.projectContext[0],
        ];
        request.mockImplementation(async (_, init) => {
            const body = JSON.parse(init?.body as string);
            expect(Object.keys(body.state.projectContext)).toHaveLength(30);
            expect(body.state.projectContext.context_0.id).toBe('net-revenue');
            return Response.json({
                model: 'test',
                answers: Object.fromEntries(
                    Object.keys(body.questions).map((key, i) => [
                        key,
                        { type: 'noul', noul: i === 0 ? 0.99 : 0.9 },
                    ]),
                ),
            });
        });
        const context = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(context?.projectContextEntryIds).toHaveLength(5);
        expect(context?.projectContextEntryIds[0]).toBe('net-revenue');
        expect(context?.content).toContain('include tax only in UK reports.');
    });

    it('skips oversized rules entirely and preserves the following complete rule', async () => {
        const { args, dependencies, request } = setupProject();
        args.projectContext = [
            {
                ...args.projectContext[0],
                id: 'oversized',
                content: `${'revenue '.repeat(500)}Except refunds.`,
            },
            args.projectContext[0],
        ];
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: { context_0: { type: 'noul', noul: 0.99 } },
            }),
        );
        const context = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(context?.projectContextEntryIds).toEqual(['net-revenue']);
        expect(request.mock.calls[0][1]?.body).not.toContain('oversized');
    });

    it('keeps smaller selected resources when another resource exceeds the output budget', async () => {
        const { args, dependencies, loadSkill } = setup();
        loadSkill.mockResolvedValue({
            name: 'metrics',
            body: 'x'.repeat(30_001),
        });
        const context = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(context?.content).toContain('Revenue excludes refunds.');
        expect(context?.content).toContain(
            'already loaded in full (uuid: doc)',
        );
        expect(context?.content).not.toContain('Skill already loaded');
    });

    it.each([false, true])(
        'bounds large multilingual catalogs with all resource kinds and history=%s',
        async (withHistory) => {
            const { args, dependencies, request } = setupProject();
            if (withHistory) {
                args.messageHistory = [
                    {
                        role: 'user',
                        content: 'Earlier revenue scope 定義 '.repeat(100),
                    },
                    {
                        role: 'assistant',
                        content: 'Applicable policy 条件 '.repeat(100),
                    },
                    { role: 'user', content: 'Apply those rules to revenue.' },
                ];
            }
            args.projectContext = Array.from({ length: 80 }, (_, i) => ({
                ...args.projectContext[0],
                id: `context-${i}`,
                content: 'revenue 定義 '.repeat(30),
            }));
            args.availableSkills = Array.from({ length: 300 }, (_, i) => ({
                name: `skill-${i}`,
                description: 'revenue 分析 '.repeat(30),
                resources: [],
                source: 'builtIn' as const,
            }));
            const documentTemplate = setup().args.knowledgeDocuments[0];
            args.knowledgeDocuments = Array.from({ length: 300 }, (_, i) => ({
                ...documentTemplate,
                uuid: `doc-${i}`,
                name: 'Revenue',
                summary: {
                    ...documentTemplate.summary,
                    description: 'revenue 定義 '.repeat(30),
                    useWhen: 'Revenue',
                },
                content: null,
                alwaysIncludeInContext: false,
            }));
            const names = Array.from({ length: 80 }, (_, i) => `mcp_${i}`);
            const runtime = {
                ...resourceRuntime,
                loadAgentTools: getLoadAgentTools(),
                loadMcpTools: {},
                ...Object.fromEntries(
                    names.map((name) => [
                        name,
                        { description: 'revenue 分析 '.repeat(70) },
                    ]),
                ),
            } as unknown as ToolSet;
            request.mockImplementation(async (_, init) => {
                const payload = init?.body as string;
                expect(Buffer.byteLength(payload)).toBeLessThan(100_000);
                const body = JSON.parse(payload);
                expect(Object.keys(body.questions).length).toBeLessThanOrEqual(
                    64,
                );
                expect(
                    Object.keys(body.state.projectContext).length,
                ).toBeGreaterThan(0);
                expect(Object.keys(body.state.skills).length).toBeGreaterThan(
                    0,
                );
                expect(
                    Object.keys(body.state.documents).length,
                ).toBeGreaterThan(0);
                return Response.json({
                    model: 'test',
                    answers: Object.fromEntries(
                        Object.entries(body.questions).map(([key]) => [
                            key,
                            key.startsWith('context_') ||
                            key.startsWith('document_') ||
                            key.startsWith('needs')
                                ? {
                                      type: 'noul',
                                      noul:
                                          key.endsWith('_0') ||
                                          key.startsWith('needs')
                                              ? 0.99
                                              : 0.01,
                                  }
                                : choice(
                                      {
                                          skill: 'skill_0',
                                          document: 'document_0',
                                          mcpTool: 'tool_0',
                                          turnIntent: 'reference_answer',
                                      }[key]!,
                                  ),
                        ]),
                    ),
                });
            });
            const context = await prepareRelevantContext(
                args,
                dependencies,
                runtime,
                names,
            );
            expect(request).toHaveBeenCalledTimes(1);
            expect(context?.projectContextEntryIds).toEqual(['context-0']);
            expect(context?.mcpToolNames).toEqual(['mcp_0']);
            expect(context?.content).toContain('Use documented metrics.');
            expect(context?.content).toContain('Revenue excludes refunds.');
        },
    );

    it('carries follow-up subject and reserves room for history in large mixed catalogs', async () => {
        const { args, dependencies, request } = setupProject();
        args.userQuestion = 'Apply those rules to FY2027.';
        args.messageHistory = [
            {
                role: 'user',
                content: 'Explain revenue under our business definition.',
            },
            { role: 'assistant', content: 'Revenue excludes refunds.' },
            { role: 'user', content: args.userQuestion },
        ];
        args.projectContext = Array.from({ length: 80 }, (_, index) => ({
            ...args.projectContext[0],
            id: `rule-${index}`,
            content: 'revenue 定義 '.repeat(80),
        }));
        request.mockImplementation(async (_, init) => {
            const payload = init?.body as string;
            expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(100000);
            const body = JSON.parse(payload);
            expect(body.state.query).toBe(args.userQuestion);
            expect(body.state.conversation.messages).toEqual([
                {
                    role: 'user',
                    text: 'Explain revenue under our business definition.',
                },
                { role: 'assistant', text: 'Revenue excludes refunds.' },
            ]);
            expect(body.questions.context_0.instructions).toContain(
                'current request takes precedence',
            );
            return Response.json({
                model: 'test',
                answers: Object.fromEntries(
                    Object.keys(body.questions).map((key) => [
                        key,
                        { type: 'noul', noul: 0.99 },
                    ]),
                ),
            });
        });
        const result = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(result?.projectContextEntryIds).toHaveLength(5);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('does not classify a truncated question', async () => {
        const { args, dependencies, request } = setupProject();
        args.messageHistory = [
            { role: 'user', content: 'Revenue '.repeat(1_500) },
        ];
        expect(
            await prepareRelevantContext(args, dependencies, resourceRuntime),
        ).toBeNull();
        expect(request).not.toHaveBeenCalled();
    });

    it('leaves always-included and already-loaded documents on their existing path', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [
            {
                ...args.knowledgeDocuments[0],
                uuid: 'always',
                alwaysIncludeInContext: true,
            },
            {
                ...args.knowledgeDocuments[0],
                uuid: 'loaded',
                content: 'Full definition',
            },
        ];
        expect(
            await prepareRelevantContext(args, dependencies, resourceRuntime),
        ).toBeNull();
        expect(request).not.toHaveBeenCalled();
        expect(args.knowledgeDocuments[1].content).toBe('Full definition');
    });

    it('loads only known, selected resources through the authorized dependencies', async () => {
        const { args, dependencies, loadSkill, getKnowledgeDocumentContent } =
            setup();
        const context = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(context?.content).toContain('Use documented metrics.');
        expect(context?.content).toContain('Revenue excludes refunds.');
        expect(loadSkill).toHaveBeenCalledExactlyOnceWith('metrics', {
            arguments: null,
        });
        expect(getKnowledgeDocumentContent).toHaveBeenCalledExactlyOnceWith({
            documentUuid: 'doc',
        });
    });

    it('respects restricted tool access before sending metadata or fetching content', async () => {
        const {
            args,
            dependencies,
            request,
            loadSkill,
            getKnowledgeDocumentContent,
        } = setup(new Set(['findContent']));
        expect(
            await prepareRelevantContext(args, dependencies, resourceRuntime),
        ).toBeNull();
        expect(request).not.toHaveBeenCalled();
        expect(loadSkill).not.toHaveBeenCalled();
        expect(getKnowledgeDocumentContent).not.toHaveBeenCalled();
    });

    it('loads complementary rules independently and preserves a conflicting definition', async () => {
        const { args, dependencies, request, getKnowledgeDocumentContent } =
            setup();
        args.availableSkills = [];
        args.knowledgeDocuments = [
            'Qualification',
            'Fiscal calendar',
            'Other definition',
            'Support',
        ].map((name, index) => ({
            ...args.knowledgeDocuments[0],
            uuid: `doc-${index}`,
            name,
        }));
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: {
                    document_0: { type: 'noul', noul: 0.99 },
                    document_1: { type: 'noul', noul: 0.98 },
                    document_2: { type: 'noul', noul: 0.97 },
                    document_3: { type: 'noul', noul: 0.01 },
                },
            }),
        );
        getKnowledgeDocumentContent.mockImplementation(
            async ({ documentUuid }) => ({
                name: documentUuid,
                content: `Complete rule for ${documentUuid}, including its exceptions.`,
            }),
        );
        const result = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(
            getKnowledgeDocumentContent.mock.calls.map(
                ([input]) => input.documentUuid,
            ),
        ).toEqual(['doc-0', 'doc-1', 'doc-2']);
        expect(result?.content).toContain(
            'Complete rule for doc-0, including its exceptions.',
        );
        expect(result?.content).toContain(
            'Complete rule for doc-1, including its exceptions.',
        );
        expect(result?.content).toContain(
            'Complete rule for doc-2, including its exceptions.',
        );
        expect(result?.content).not.toContain('doc-3');
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('caps document reads at three and retains the authorized documents when another read fails', async () => {
        const { args, dependencies, request, getKnowledgeDocumentContent } =
            setup();
        args.availableSkills = [];
        args.knowledgeDocuments = Array.from({ length: 35 }, (_, index) => ({
            ...args.knowledgeDocuments[0],
            uuid: `doc-${index}`,
        }));
        request.mockImplementation(async (_, init) => {
            const body = JSON.parse(init?.body as string);
            expect(Object.keys(body.state.documents)).toHaveLength(30);
            return Response.json({
                model: 'test',
                answers: Object.fromEntries(
                    Object.keys(body.questions).map((key) => [
                        key,
                        { type: 'noul', noul: 0.99 },
                    ]),
                ),
            });
        });
        getKnowledgeDocumentContent.mockImplementation(
            async ({ documentUuid }) => {
                if (documentUuid === 'doc-0') throw new Error('Access revoked');
                return { name: documentUuid, content: `Rule ${documentUuid}` };
            },
        );
        const result = await prepareRelevantContext(
            args,
            dependencies,
            resourceRuntime,
        );
        expect(getKnowledgeDocumentContent).toHaveBeenCalledTimes(3);
        expect(result?.content).not.toContain('Rule doc-0');
        expect(result?.content).toContain('Rule doc-1');
        expect(result?.content).toContain('Rule doc-2');
    });

    it.each([0.84, 0.85])(
        'uses the reference-retrieval relevance gate at 0.85: %s',
        async (noul) => {
            const { args, dependencies, request, getKnowledgeDocumentContent } =
                setup();
            args.availableSkills = [];
            request.mockResolvedValue(
                Response.json({
                    model: 'test',
                    answers: {
                        document_0: { type: 'noul', noul },
                    },
                }),
            );
            const result = await prepareRelevantContext(
                args,
                dependencies,
                resourceRuntime,
            );
            expect(getKnowledgeDocumentContent).toHaveBeenCalledTimes(
                noul >= 0.85 ? 1 : 0,
            );
            expect(result !== null).toBe(noul >= 0.85);
        },
    );

    it('does not preload documents marked low or unrelated even when names match', async () => {
        const { args, dependencies, request } = setup();
        args.availableSkills = [];
        args.knowledgeDocuments = ['low', 'none'].map((relevance) => ({
            ...args.knowledgeDocuments[0],
            summary: { ...args.knowledgeDocuments[0].summary, relevance },
        })) as typeof args.knowledgeDocuments;
        expect(
            await prepareRelevantContext(args, dependencies, resourceRuntime),
        ).toBeNull();
        expect(request).not.toHaveBeenCalled();
    });

    it('falls back if access was revoked after selection', async () => {
        const { args, dependencies, loadSkill, getKnowledgeDocumentContent } =
            setup();
        loadSkill.mockRejectedValue(new Error('Forbidden'));
        getKnowledgeDocumentContent.mockRejectedValue(new Error('Forbidden'));
        expect(
            await prepareRelevantContext(args, dependencies, resourceRuntime),
        ).toBeNull();
    });

    it('does not preload into deep research or when disabled', async () => {
        const { args, dependencies, request } = setup();
        expect(
            await prepareRelevantContext(
                { ...args, decisions: undefined },
                dependencies,
            ),
        ).toBeNull();
        expect(
            await prepareRelevantContext(
                {
                    ...args,
                    execution: { mode: 'deep_research' },
                } as AiAgentArgs,
                dependencies,
            ),
        ).toBeNull();
        expect(request).not.toHaveBeenCalled();
    });

    const mcpRuntime = {
        loadMcpTools: { description: 'Load tools' },
        mcp_issues_search: { description: 'Search issues', execute: vi.fn() },
        mcp_files_read: { description: 'Read files', execute: vi.fn() },
    } as unknown as ToolSet;

    const setupMcp = () => {
        const result = setup();
        result.args.availableSkills = [];
        result.args.knowledgeDocuments = [];
        result.request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: {
                    mcpTool: choice('tool_1'),
                },
            }),
        );
        return result;
    };

    it('preloads one available MCP definition without executing it', async () => {
        const { args, dependencies, request } = setupMcp();
        const context = await prepareRelevantContext(
            args,
            dependencies,
            mcpRuntime,
            ['mcp_issues_search', 'mcp_files_read'],
        );
        expect(context?.mcpToolNames).toEqual(['mcp_files_read']);
        expect(context?.content).toContain(
            'MCP tool definition already loaded: mcp_files_read',
        );
        expect(mcpRuntime.mcp_files_read.execute).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('keeps MCP selection in the same provider request as skill/document selection', async () => {
        const { args, dependencies, request } = setup();
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: {
                    skill: choice('skill_0'),
                    needsSkill: { type: 'noul', noul: 0.99 },
                    document_0: { type: 'noul', noul: 0.99 },
                    mcpTool: choice('tool_0'),
                },
            }),
        );
        const context = await prepareRelevantContext(
            args,
            dependencies,
            { ...resourceRuntime, ...mcpRuntime },
            ['mcp_files_read'],
        );
        expect(context?.content).toContain('Use documented metrics.');
        expect(context?.content).toContain('Revenue excludes refunds.');
        expect(context?.mcpToolNames).toEqual(['mcp_files_read']);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it.each([
        choice('none'),
        choice('tool_999'),
        { ...choice('tool_0'), confidence: 0.94 },
        { ...choice('tool_0'), probabilities: { tool_0: 0.94, none: 0.06 } },
    ])(
        'retains lazy loading when the MCP choice is uncertain or invalid: %j',
        async (answer) => {
            const { args, dependencies, request } = setupMcp();
            request.mockResolvedValue(
                Response.json({ model: 'test', answers: { mcpTool: answer } }),
            );
            expect(
                await prepareRelevantContext(args, dependencies, mcpRuntime, [
                    'mcp_files_read',
                ]),
            ).toBeNull();
        },
    );

    it('keeps the existing loader on provider failure', async () => {
        const { args, dependencies, request } = setupMcp();
        request.mockRejectedValue(new Error('Provider unavailable'));
        expect(
            await prepareRelevantContext(args, dependencies, mcpRuntime, [
                'mcp_files_read',
            ]),
        ).toBeNull();
    });

    it('does not send descriptions of missing or unauthorized tools', async () => {
        const { args, dependencies, request } = setupMcp();
        args.execution = {
            mode: 'standard',
            maxSteps: 10,
            toolAllowlist: new Set(['loadMcpTools', 'mcp_files_read']),
        };
        request.mockResolvedValue(
            Response.json({
                model: 'test',
                answers: { mcpTool: choice('tool_0') },
            }),
        );
        const context = await prepareRelevantContext(
            args,
            dependencies,
            mcpRuntime,
            ['mcp_issues_search', 'mcp_removed', 'mcp_files_read'],
        );
        expect(context?.mcpToolNames).toEqual(['mcp_files_read']);
        expect(request.mock.calls[0][1]?.body).not.toContain('Search issues');
        expect(request.mock.calls[0][1]?.body).not.toContain('mcp_removed');
    });

    it('requires the loader in the final runtime', async () => {
        const { args, dependencies, request } = setupMcp();
        expect(
            await prepareRelevantContext(
                args,
                dependencies,
                { mcp_files_read: mcpRuntime.mcp_files_read },
                ['mcp_files_read'],
            ),
        ).toBeNull();
        expect(request).not.toHaveBeenCalled();
    });

    it('bounds the candidate definitions and descriptions', async () => {
        const { args, dependencies, request } = setupMcp();
        const names = Array.from({ length: 80 }, (_, i) => `mcp_tool_${i}`);
        const tools = {
            loadMcpTools: mcpRuntime.loadMcpTools,
            ...Object.fromEntries(
                names.map((name) => [name, { description: 'x'.repeat(2000) }]),
            ),
        } as ToolSet;
        await prepareRelevantContext(args, dependencies, tools, names);
        const body = JSON.parse(request.mock.calls[0][1]?.body as string);
        expect(Object.keys(body.questions.mcpTool.criteria)).toHaveLength(41);
        expect(JSON.stringify(body)).not.toContain('mcp_tool_40');
        expect(JSON.stringify(body).length).toBeLessThan(35_000);
    });
});
