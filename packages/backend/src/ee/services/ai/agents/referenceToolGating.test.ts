import { generateText, stepCountIs, tool, type ToolSet } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { getLoadAgentTools } from '../tools/loadAgentTools';
import {
    createIntentToolGate,
    getDeferredPromptSections,
    getIntentToolNames,
} from './referenceToolGating';

const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const tools = () => ({
    loadAgentTools: getLoadAgentTools(),
    getKnowledgeDocumentContent: tool({ inputSchema: z.object({}) }),
    runQuery: tool({ inputSchema: z.object({}) }),
    generateVisualization: tool({ inputSchema: z.object({}) }),
    exportChartAsCode: tool({ inputSchema: z.object({}) }),
    findContent: tool({ inputSchema: z.object({}) }),
    readContent: tool({ inputSchema: z.object({}) }),
    generateDataApp: tool({ inputSchema: z.object({}) }),
    iterateDataApp: tool({ inputSchema: z.object({}) }),
    listDataAppThemes: tool({ inputSchema: z.object({}) }),
    createContent: tool({ inputSchema: z.object({}) }),
    runContentQuery: tool({ inputSchema: z.object({}) }),
    runSql: tool({ inputSchema: z.object({}) }),
    editRepo: tool({ inputSchema: z.object({}) }),
});

describe('intent toolbox', () => {
    it('sends smaller schemas to the SDK and restores only registered tools after loading', async () => {
        const gate = createIntentToolGate(tools(), 'reference_answer');
        let calls = 0;
        const result = await generateText({
            model: new MockLanguageModelV3({
                doGenerate: async (options) => {
                    calls += 1;
                    const names = options.tools?.map(({ name }) => name);
                    if (calls === 1) {
                        expect(names).not.toContain('editRepo');
                        expect(names).toEqual([
                            'loadAgentTools',
                            'getKnowledgeDocumentContent',
                            'findContent',
                            'readContent',
                        ]);
                        return {
                            content: [
                                {
                                    type: 'tool-call',
                                    toolCallId: 'load-1',
                                    toolName: 'loadAgentTools',
                                    input: '{}',
                                },
                            ],
                            finishReason: {
                                unified: 'tool-calls',
                                raw: undefined,
                            },
                            usage,
                            warnings: [],
                        };
                    }
                    expect(names).toContain('generateVisualization');
                    expect(names).toContain('editRepo');
                    return {
                        content: [
                            { type: 'text', text: 'Full toolbox restored.' },
                        ],
                        finishReason: { unified: 'stop', raw: undefined },
                        usage,
                        warnings: [],
                    };
                },
            }),
            tools: gate.tools,
            prompt: 'Use another tool if needed.',
            prepareStep: () => ({ activeTools: gate.activeTools() }),
            stopWhen: stepCountIs(3),
        });
        expect(result.text).toBe('Full toolbox restored.');
        expect(calls).toBe(2);
    });

    it('keeps normal tools when disabled or the loader is not authorized', () => {
        expect(
            createIntentToolGate(tools(), null).activeTools(),
        ).toBeUndefined();
        const restricted: ToolSet = {
            getKnowledgeDocumentContent: tools().getKnowledgeDocumentContent,
        };
        const gate = createIntentToolGate(restricted, 'reference_answer');
        expect(gate.activeTools()).toBeUndefined();
        expect(gate.tools).toBe(restricted);
    });

    it('isolates loaded state between turns and can restore after a user steer', () => {
        const first = createIntentToolGate(tools(), 'reference_answer');
        const second = createIntentToolGate(tools(), 'reference_answer');
        first.restore();
        expect(first.activeTools()).toBeUndefined();
        expect(second.activeTools()).not.toContain('generateVisualization');
        second.restore();
        expect(second.activeTools()).toBeUndefined();
    });

    it('separates answer, chart, data app, export and repository outcomes', () => {
        expect(
            createIntentToolGate(tools(), 'data_answer').activeTools(),
        ).toEqual(expect.arrayContaining(['loadAgentTools', 'runQuery']));
        expect(
            createIntentToolGate(tools(), 'data_answer').activeTools(),
        ).not.toContain('generateVisualization');
        expect(createIntentToolGate(tools(), 'chart').activeTools()).toEqual(
            expect.arrayContaining(['generateVisualization']),
        );
        expect(
            createIntentToolGate(tools(), 'chart_from_previous').activeTools(),
        ).toEqual(expect.arrayContaining(['generateVisualization']));
        expect(
            createIntentToolGate(tools(), 'chart').activeTools(),
        ).not.toContain('runQuery');
        expect(
            createIntentToolGate(tools(), 'chart_export').activeTools(),
        ).toEqual(['loadAgentTools', 'exportChartAsCode']);
        expect(
            createIntentToolGate(tools(), 'data_app_create').activeTools(),
        ).toEqual(
            expect.arrayContaining([
                'findContent',
                'generateDataApp',
                'listDataAppThemes',
            ]),
        );
        expect(
            createIntentToolGate(tools(), 'data_app_create').activeTools(),
        ).not.toContain('iterateDataApp');
        expect(
            createIntentToolGate(tools(), 'data_app_iterate').activeTools(),
        ).toEqual(
            expect.arrayContaining([
                'findContent',
                'iterateDataApp',
                'listDataAppThemes',
            ]),
        );
        expect(
            createIntentToolGate(tools(), 'data_app_iterate').activeTools(),
        ).not.toContain('generateDataApp');
        expect(
            createIntentToolGate(tools(), 'data_app_read').activeTools(),
        ).toEqual(expect.arrayContaining(['findContent', 'readContent']));
        expect(
            createIntentToolGate(tools(), 'data_app_read').activeTools(),
        ).not.toContain('createContent');
        expect(
            createIntentToolGate(tools(), 'repository_change').activeTools(),
        ).toEqual(expect.arrayContaining(['editRepo']));
        expect(
            createIntentToolGate(tools(), 'repository_change').activeTools(),
        ).not.toContain('generateVisualization');
    });
});

describe('deferred prompt sections', () => {
    it('starts with the union of likely turn types when none is confident', () => {
        const active = createIntentToolGate(tools(), null, [
            'data_answer',
            'chart_from_previous',
        ]).activeTools();
        expect(active).toEqual(
            expect.arrayContaining(['runQuery', 'generateVisualization']),
        );
        expect(active).not.toContain('createContent');
        expect(active).not.toContain('editRepo');
    });

    it('keeps the full toolbox when a likely turn type does not narrow it', () => {
        expect(
            createIntentToolGate(tools(), null, [
                'data_answer',
                'other',
            ]).activeTools(),
        ).toBeUndefined();
    });

    it('keeps runContentQuery out of the data answer toolbox', () => {
        expect(
            createIntentToolGate(tools(), 'data_answer').activeTools(),
        ).not.toContain('runContentQuery');
    });

    it('defers sections whose tools are outside the initial toolbox', () => {
        expect([
            ...getDeferredPromptSections(
                getIntentToolNames(tools(), ['data_answer']),
            ),
        ]).toEqual(
            expect.arrayContaining([
                'runSql',
                'contentTools',
                'generateDataApp',
            ]),
        );
        expect(
            getDeferredPromptSections(
                getIntentToolNames(tools(), ['data_app_create']),
            ),
        ).not.toContain('generateDataApp');
        expect(
            getDeferredPromptSections(getIntentToolNames(tools(), ['other']))
                .size,
        ).toBe(0);
    });

    it('returns deferred instructions when the remaining tools load', async () => {
        const gate = createIntentToolGate(
            tools(),
            'data_answer',
            ['data_answer'],
            '## Content tools',
        );
        let secondPrompt = '';
        let calls = 0;
        await generateText({
            model: new MockLanguageModelV3({
                doGenerate: async (options) => {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            content: [
                                {
                                    type: 'tool-call',
                                    toolCallId: 'load-1',
                                    toolName: 'loadAgentTools',
                                    input: '{}',
                                },
                            ],
                            finishReason: {
                                unified: 'tool-calls',
                                raw: undefined,
                            },
                            usage,
                            warnings: [],
                        };
                    }
                    secondPrompt = JSON.stringify(options.prompt);
                    return {
                        content: [{ type: 'text', text: 'done' }],
                        finishReason: { unified: 'stop', raw: undefined },
                        usage,
                        warnings: [],
                    };
                },
            }),
            tools: gate.tools,
            prompt: 'Save this as a chart.',
            prepareStep: () => ({ activeTools: gate.activeTools() }),
            stopWhen: stepCountIs(3),
        });
        expect(secondPrompt).toContain('## Content tools');
    });
});
