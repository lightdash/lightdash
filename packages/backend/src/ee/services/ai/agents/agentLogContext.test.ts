import type { ToolSet } from 'ai';
import { getAiAgentLogContext } from '../../../../logging/aiAgentLogContext';
import { withToolCallLogContext } from './agentLogContext';

const turnContext = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
    toolCallId: null,
    toolName: null,
    model: 'claude-sonnet-5-5',
    serverVersion: '1.2.3',
    threadUrl: 'http://localhost/thread',
};

describe('withToolCallLogContext', () => {
    it('runs each tool with the turn context and its own tool call', async () => {
        const tools = withToolCallLogContext(
            {
                runQuery: {
                    inputSchema: {},
                    execute: async () => getAiAgentLogContext(),
                },
            } as unknown as ToolSet,
            turnContext,
        );

        const execute = tools.runQuery.execute as (
            input: unknown,
            options: { toolCallId: string },
        ) => Promise<unknown>;
        const seen = await Promise.all(
            ['call-1', 'call-2'].map((toolCallId) =>
                execute({}, { toolCallId }),
            ),
        );

        expect(seen).toEqual([
            { ...turnContext, toolCallId: 'call-1', toolName: 'runQuery' },
            { ...turnContext, toolCallId: 'call-2', toolName: 'runQuery' },
        ]);
    });
});
