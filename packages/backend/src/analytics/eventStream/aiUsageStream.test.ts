import type { AiUsageEvent } from '../aiUsage';
import { EventStreamSink } from './EventStreamSink';
import { EVENT_STREAM_SCHEMA_VERSION } from './projection';
import { eventStreamRegistry } from './registry';
import { EventStreamRow } from './types';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const createWriterMock = () => ({
    push: vi.fn<(stream: string, row: EventStreamRow) => void>(),
    flush: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
});

const aiUsageEvent: AiUsageEvent = {
    event: 'ai.usage',
    userId: 'user-1',
    properties: {
        feature: 'agent',
        functionId: 'generateAgentResponse',
        organizationId: 'org-1',
        projectId: 'project-1',
        aiAgentId: 'agent-1',
        threadId: 'thread-1',
        promptId: 'prompt-1',
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 800,
        cacheWriteTokens: 50,
        reasoningTokens: 30,
        totalTokens: 1200,
    },
};

describe('ai_usage stream projection', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('projects an ai.usage event', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle(aiUsageEvent);
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [stream, row] = writer.push.mock.calls[0];
        expect(stream).toBe('ai_usage');
        expect(row).toMatchObject({
            event_name: 'ai.usage',
            org_id: 'org-1',
            user_id: 'user-1',
            schema_version: EVENT_STREAM_SCHEMA_VERSION,
            project_id: 'project-1',
            feature: 'agent',
            function_id: 'generateAgentResponse',
            agent_id: 'agent-1',
            thread_id: 'thread-1',
            prompt_id: 'prompt-1',
            model: 'claude-sonnet-5',
            provider: 'anthropic',
            input_tokens: 1000,
            output_tokens: 200,
            cache_read_tokens: 800,
            cache_write_tokens: 50,
            reasoning_tokens: 30,
            total_tokens: 1200,
        });
        expect(new Date(row.event_ts).toISOString()).toBe(row.event_ts);
    });

    it('projects null dimensions and token classes as null columns', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            ...aiUsageEvent,
            properties: {
                ...aiUsageEvent.properties,
                projectId: null,
                aiAgentId: null,
                threadId: null,
                promptId: null,
                model: null,
                provider: null,
                cacheReadTokens: null,
                cacheWriteTokens: null,
                reasoningTokens: null,
            },
        });
        expect(writer.push).toHaveBeenCalledTimes(1);
        const [, row] = writer.push.mock.calls[0];
        expect(row).toMatchObject({
            event_name: 'ai.usage',
            project_id: null,
            agent_id: null,
            thread_id: null,
            prompt_id: null,
            model: null,
            provider: null,
            cache_read_tokens: null,
            cache_write_tokens: null,
            reasoning_tokens: null,
        });
    });

    it('drops events without an organization id', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            ...aiUsageEvent,
            properties: {
                ...aiUsageEvent.properties,
                organizationId: null,
            },
        });
        expect(writer.push).not.toHaveBeenCalled();
    });
});
