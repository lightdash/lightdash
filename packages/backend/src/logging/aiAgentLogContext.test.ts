import { runWithAiAgentLogContext } from './aiAgentLogContext';
import { formatters } from './winston';

// winston's formatted output key (triple-beam MESSAGE)
const MESSAGE = Symbol.for('message');

const context = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
    toolCallId: 'tool-call-id',
    toolName: 'runQuery',
    model: 'claude-sonnet-5-5',
    serverVersion: '1.2.3',
    threadUrl:
        'http://localhost/projects/project-uuid/ai-agents/agent-uuid/threads/thread-uuid',
};

const format = (formatter: keyof typeof formatters) =>
    formatters[formatter].transform({
        level: 'error',
        message: '[AiAgent][Tool Error Handler] boom',
    }) as Record<string | symbol, unknown>;

describe('AI agent log context', () => {
    it('adds every id to JSON log lines inside an agent turn', () => {
        const line = runWithAiAgentLogContext(context, () => format('json'));
        expect(JSON.parse(String(line[MESSAGE]))).toMatchObject({
            message: '[AiAgent][Tool Error Handler] boom',
            aiAgent: context,
        });
    });

    it('prints thread, prompt and tool call ids on plain log lines', () => {
        const line = runWithAiAgentLogContext(context, () => format('plain'));
        expect(line[MESSAGE]).toContain(
            '[AiAgent thread=thread-uuid prompt=prompt-uuid toolCall=tool-call-id] error: [AiAgent][Tool Error Handler] boom',
        );
    });

    it('leaves log lines outside an agent turn unchanged', () => {
        const line = format('json');
        expect(JSON.parse(String(line[MESSAGE]))).not.toHaveProperty('aiAgent');
    });
});
