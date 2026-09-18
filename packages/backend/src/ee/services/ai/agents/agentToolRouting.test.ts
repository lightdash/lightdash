import { tool, type ModelMessage, type ToolSet } from 'ai';
import { z } from 'zod';
import type { AiAgentArgs } from '../types/aiAgent';
import {
    ALWAYS_LOADED_TOOL_NAMES,
    isToolRoutingEnabled,
    TOOL_SEARCH_TOOL_NAME,
    withToolSearch,
} from './agentToolRouting';

const stubTool = () =>
    tool({
        description: 'stub',
        inputSchema: z.object({}),
        execute: async () => ({
            result: 'ok',
            metadata: { status: 'success' },
        }),
    });

const stubTools = (names: string[]): ToolSet =>
    Object.fromEntries(names.map((name) => [name, stubTool()]));

const standardExecution: AiAgentArgs['execution'] = {
    mode: 'standard',
    maxSteps: 10,
};

const historyWithToolCall = (toolName: string): ModelMessage[] => [
    { role: 'user', content: 'question' },
    {
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName,
                input: {},
            },
        ],
    },
];

describe('isToolRoutingEnabled', () => {
    it('only applies to a standard run with the full tool set', () => {
        expect(isToolRoutingEnabled(standardExecution)).toBe(true);
        expect(
            isToolRoutingEnabled({
                ...standardExecution,
                toolAllowlist: new Set(['findContent']),
            }),
        ).toBe(false);
        expect(
            isToolRoutingEnabled({
                mode: 'deep_research',
                runUuid: 'run-1',
                phase: 'planning',
                maxSteps: 10,
                budget: {
                    maxSteps: 10,
                    maxTokens: 1000,
                    maxToolCalls: 10,
                    maxWarehouseQueries: 10,
                    deadlineMs: 60_000,
                    maxResultRows: 100,
                },
                canUseRawSql: false,
                initialTokenUsage: 0,
                research: { role: 'coordinator', runTask: vi.fn() },
            }),
        ).toBe(false);
    });
});

describe('withToolSearch', () => {
    it('defers every tool outside the core set and adds the search tool', () => {
        const tools = withToolSearch({
            tools: stubTools(['grepFields', 'createScheduledDelivery']),
            toolHints: [],
            messageHistory: [],
            mcpToolNames: [],
        });

        expect(Object.keys(tools).sort()).toEqual([
            'createScheduledDelivery',
            'grepFields',
            TOOL_SEARCH_TOOL_NAME,
        ]);
        expect(tools.grepFields.deferLoading).toBeUndefined();
        expect(tools.createScheduledDelivery.deferLoading).toBe(true);
        expect(tools[TOOL_SEARCH_TOOL_NAME].deferLoading).toBeUndefined();
    });

    it('keeps hinted, previously called and MCP tools loaded', () => {
        const tools = withToolSearch({
            tools: stubTools([
                'editDbtProject',
                'readContent',
                'mcp_github_list_issues',
                'listProjects',
            ]),
            toolHints: ['editDbtProject'],
            messageHistory: historyWithToolCall('readContent'),
            mcpToolNames: ['mcp_github_list_issues'],
        });

        expect(tools.editDbtProject.deferLoading).toBeUndefined();
        expect(tools.readContent.deferLoading).toBeUndefined();
        expect(tools.mcp_github_list_issues.deferLoading).toBeUndefined();
        expect(tools.listProjects.deferLoading).toBe(true);
    });

    it('never defers a core tool', () => {
        const tools = withToolSearch({
            tools: stubTools([...ALWAYS_LOADED_TOOL_NAMES]),
            toolHints: [],
            messageHistory: [],
            mcpToolNames: [],
        });

        for (const name of ALWAYS_LOADED_TOOL_NAMES) {
            expect(tools[name].deferLoading).toBeUndefined();
        }
    });
});
