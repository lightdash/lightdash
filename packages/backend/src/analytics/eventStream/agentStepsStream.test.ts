import type {
    AiAgentStepCompletedEvent,
    AiAgentToolCallCompletedEvent,
} from '../LightdashAnalytics';
import { EventStreamSink } from './EventStreamSink';
import { agentStepsCompactedColumns } from './agentStepsStream';
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

const stepEvent: AiAgentStepCompletedEvent = {
    event: 'ai_agent.step_completed',
    userId: 'user-1',
    properties: {
        organizationId: 'org-1',
        projectId: 'project-1',
        aiAgentId: 'agent-1',
        promptId: 'prompt-1',
        threadId: 'thread-1',
        stepIndex: 2,
        model: 'claude-sonnet-5',
        modelProvider: 'anthropic',
        stepOffsetMs: 8_000,
        stepTotalMs: 5_500,
        inferenceMs: 4_200,
        toolWallMs: 1_300,
        ttftMs: 900,
        toolCallCount: 3,
        reasoningChars: 412,
        inputTokens: 12_000,
        outputTokens: 320,
        cacheReadTokens: 11_000,
        cacheWriteTokens: 500,
        reasoningTokens: 180,
        totalTokens: 12_320,
    },
};

const toolCallEvent: AiAgentToolCallCompletedEvent = {
    event: 'ai_agent.tool_call_completed',
    userId: 'user-1',
    properties: {
        organizationId: 'org-1',
        projectId: 'project-1',
        aiAgentId: 'agent-1',
        toolName: 'runMetricQuery',
        threadId: 'thread-1',
        promptId: 'prompt-1',
        toolCallId: 'call-9',
        stepIndex: 2,
        durationMs: 1_300,
        status: 'success',
    },
};

describe('agentStepsStream', () => {
    it('projects a completed step into the agent_steps stream', () => {
        const writer = createWriterMock();
        new EventStreamSink(eventStreamRegistry, writer).handle(stepEvent);

        expect(writer.push).toHaveBeenCalledTimes(1);
        const [stream, row] = writer.push.mock.calls[0]!;
        expect(stream).toBe('agent_steps');
        expect(row).toMatchObject({
            event_name: 'ai_agent.step_completed',
            org_id: 'org-1',
            user_id: 'user-1',
            schema_version: EVENT_STREAM_SCHEMA_VERSION,
            record_type: 'step',
            prompt_id: 'prompt-1',
            step_index: 2,
            inference_ms: 4_200,
            tool_wall_ms: 1_300,
            ttft_ms: 900,
            total_tokens: 12_320,
        });
    });

    it('projects a completed tool call into the same stream', () => {
        const writer = createWriterMock();
        new EventStreamSink(eventStreamRegistry, writer).handle(toolCallEvent);

        const [stream, row] = writer.push.mock.calls[0]!;
        expect(stream).toBe('agent_steps');
        expect(row).toMatchObject({
            record_type: 'tool_call',
            prompt_id: 'prompt-1',
            step_index: 2,
            tool_call_id: 'call-9',
            tool_name: 'runMetricQuery',
            tool_duration_ms: 1_300,
            tool_status: 'success',
        });
    });

    it('shares one schema across both grains, nulling the absent side', () => {
        const writer = createWriterMock();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle(stepEvent);
        sink.handle(toolCallEvent);

        const columns = agentStepsCompactedColumns.map((c) => c.name);
        writer.push.mock.calls.forEach(([, row]) => {
            // Every declared column is present, so the parquet cast never sees
            // a missing key for one grain.
            columns.forEach((column) => expect(row).toHaveProperty(column));
        });

        const [, stepRow] = writer.push.mock.calls[0]!;
        const [, toolRow] = writer.push.mock.calls[1]!;
        expect(stepRow.tool_call_id).toBeNull();
        expect(toolRow.inference_ms).toBeNull();
    });

    it('drops events that cannot be attributed to an organization', () => {
        const writer = createWriterMock();
        new EventStreamSink(eventStreamRegistry, writer).handle({
            ...stepEvent,
            properties: { ...stepEvent.properties, organizationId: '' },
        });

        expect(writer.push).not.toHaveBeenCalled();
    });

    it('keeps a null inference split rather than coercing it to zero', () => {
        const writer = createWriterMock();
        new EventStreamSink(eventStreamRegistry, writer).handle({
            ...stepEvent,
            properties: {
                ...stepEvent.properties,
                inferenceMs: null,
                toolWallMs: null,
            },
        });

        const [, row] = writer.push.mock.calls[0]!;
        expect(row.inference_ms).toBeNull();
        expect(row.tool_wall_ms).toBeNull();
        expect(row.step_total_ms).toBe(5_500);
    });
});
