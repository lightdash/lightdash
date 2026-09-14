import {
    createSlice,
    prepareAutoBatched,
    type PayloadAction,
} from '@reduxjs/toolkit';
import { type AiAgentToolCall } from '../types';

type ToolCall = AiAgentToolCall & {
    toolCallId: string;
    toolResult: AiAgentToolCall['toolResult'];
};

type Reasoning = {
    reasoningId: string;
    parts: string[];
};

export type StepProgressMessage = {
    message: string;
    // The tool the event belongs to, or null when the emitting tool didn't
    // attribute it. Used to scope the inline progress row to the active tool.
    toolName: string | null;
    // Correlates repeated events about the same unit of work (composer
    // pipeline nodes use `${toolCallId}:${nodeId}`), or null for one-off
    // progress strings.
    progressId: string | null;
    // Lifecycle of the unit identified by progressId, or null when the event
    // is a plain progress string.
    progressStatus: 'in_progress' | 'complete' | 'error' | null;
};

/** Client-clock stopwatch for the live stream; ms since epoch. */
export type StreamTiming = {
    startedAt: number;
    firstTokenAt: number | null;
    finishedAt: number | null;
};

export type StreamPart =
    | { type: 'text'; text: string }
    | (ToolCall & { type: 'toolCall' });

export type AiAgentThreadStreamConnection =
    | { status: 'streaming' }
    | { status: 'recovering' }
    | { status: 'polling' }
    | { status: 'complete' }
    | { status: 'error'; error: string };

const activeConnectionStatuses = {
    streaming: true,
    recovering: true,
    polling: true,
    complete: false,
    error: false,
} satisfies Record<AiAgentThreadStreamConnection['status'], boolean>;

const recoveryConnectionStatuses = {
    streaming: false,
    recovering: true,
    polling: true,
    complete: false,
    error: false,
} satisfies Record<AiAgentThreadStreamConnection['status'], boolean>;

export const isAiAgentThreadStreamActive = (
    connection: AiAgentThreadStreamConnection,
) => activeConnectionStatuses[connection.status];

export const isAiAgentThreadStreamRecoveryActive = (
    connection: AiAgentThreadStreamConnection,
) => recoveryConnectionStatuses[connection.status];

const dedupeStreamParts = (parts: StreamPart[]): StreamPart[] => {
    const dedupedParts: StreamPart[] = [];
    const toolCallIndexById = new Map<string, number>();

    for (const part of parts) {
        if (part.type !== 'toolCall') {
            dedupedParts.push(part);
            continue;
        }

        const existingIndex = toolCallIndexById.get(part.toolCallId);
        if (existingIndex === undefined) {
            toolCallIndexById.set(part.toolCallId, dedupedParts.length);
            dedupedParts.push(part);
        } else {
            dedupedParts[existingIndex] = {
                ...dedupedParts[existingIndex],
                ...part,
            } as StreamPart;
        }
    }

    return dedupedParts;
};

export interface AiAgentThreadStreamingState {
    threadUuid: string;
    messageUuid: string;
    content: string;
    parts: StreamPart[];
    connection: AiAgentThreadStreamConnection;
    toolCalls: ToolCall[];
    reasoning: Reasoning[];
    decidedToolCallIds: string[];
    /**
     * Ordered history of step-progress events emitted by the agent's
     * tools (e.g. "Starting sandbox…", "Cloning project…", "Editing
     * models…"). Each `data-step-progress` SSE chunk is appended here
     * (with adjacent-duplicate dedup). `toolName` is the tool the event
     * belongs to (null for tools that don't attribute their progress);
     * the bubble uses it to scope the inline progress row to the active
     * tool, so a concurrently running tool (e.g. a `findFields` query
     * fired alongside a writeback) can't surface its message under the
     * writeback header. Keeping the full history — across tools — in
     * state means we can revisit the presentation (timeline, summary on
     * hover, etc.) without changing the wire protocol.
     */
    stepProgressMessages: StepProgressMessage[];
    timing: StreamTiming;
}

type State = Record<string, AiAgentThreadStreamingState>;

const initialState: State = {};
const initialThread: Omit<
    AiAgentThreadStreamingState,
    'threadUuid' | 'messageUuid' | 'timing'
> = {
    content: '',
    parts: [],
    connection: { status: 'streaming' },
    toolCalls: [],
    reasoning: [],
    decidedToolCallIds: [],
    stepProgressMessages: [],
};

export const aiAgentThreadStreamSlice = createSlice({
    name: 'aiAgentThreadStream',
    initialState,
    reducers: {
        startStreaming: (
            state,
            action: PayloadAction<{ threadUuid: string; messageUuid: string }>,
        ) => {
            const { threadUuid, messageUuid } = action.payload;

            state[threadUuid] = {
                threadUuid,
                messageUuid,
                ...initialThread,
                timing: {
                    startedAt: Date.now(),
                    firstTokenAt: null,
                    finishedAt: null,
                },
            };
        },
        markFirstToken: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const streamingThread = state[action.payload.threadUuid];
            if (
                streamingThread &&
                streamingThread.timing.firstTokenAt === null
            ) {
                streamingThread.timing.firstTokenAt = Date.now();
            }
        },
        setMessage: {
            reducer: (
                state,
                action: PayloadAction<{
                    threadUuid: string;
                    content: string;
                }>,
            ) => {
                const { threadUuid, content } = action.payload;

                const streamingThread = state[threadUuid];
                if (streamingThread) {
                    streamingThread.content = content;
                } else {
                    console.warn('Streaming thread or message not found:', {
                        threadUuid,
                    });
                }
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                content: string;
            }>(),
        },
        setParts: {
            reducer: (
                state,
                action: PayloadAction<{
                    threadUuid: string;
                    parts: StreamPart[];
                }>,
            ) => {
                const { threadUuid, parts } = action.payload;
                const streamingThread = state[threadUuid];
                if (streamingThread) {
                    streamingThread.parts = dedupeStreamParts(parts);
                }
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                parts: StreamPart[];
            }>(),
        },
        markToolCallDecided: {
            reducer: (
                state,
                action: PayloadAction<{
                    threadUuid: string;
                    toolCallId: string;
                }>,
            ) => {
                const { threadUuid, toolCallId } = action.payload;
                const streamingThread = state[threadUuid];
                if (
                    streamingThread &&
                    !streamingThread.decidedToolCallIds.includes(toolCallId)
                ) {
                    streamingThread.decidedToolCallIds.push(toolCallId);
                }
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                toolCallId: string;
            }>(),
        },
        markStreamRecovering: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const streamingThread = state[action.payload.threadUuid];
            if (streamingThread?.connection.status === 'streaming') {
                streamingThread.connection = { status: 'recovering' };
            }
        },
        markStreamPolling: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const streamingThread = state[action.payload.threadUuid];
            if (streamingThread?.connection.status === 'recovering') {
                streamingThread.connection = { status: 'polling' };
            }
        },
        stopStreaming: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const streamingThread = state[action.payload.threadUuid];
            if (streamingThread) {
                streamingThread.connection = { status: 'complete' };
                streamingThread.timing.finishedAt ??= Date.now();
            }
        },
        addToolCall: {
            reducer: (
                state,
                action: PayloadAction<ToolCall & { threadUuid: string }>,
            ) => {
                const { threadUuid, ...toolCall } = action.payload;
                const streamingThread = state[threadUuid];
                if (streamingThread) {
                    const existingIndex = streamingThread.toolCalls.findIndex(
                        (tc: ToolCall) => tc.toolCallId === toolCall.toolCallId,
                    );
                    if (existingIndex !== -1) {
                        streamingThread.toolCalls[existingIndex] = {
                            ...streamingThread.toolCalls[existingIndex],
                            ...toolCall,
                        } as ToolCall;
                    } else {
                        streamingThread.toolCalls.push(toolCall);
                    }
                }
            },
            prepare: prepareAutoBatched<ToolCall & { threadUuid: string }>(),
        },
        setError: (
            state,
            action: PayloadAction<{ threadUuid: string; error: string }>,
        ) => {
            const { threadUuid, error } = action.payload;
            console.error('Setting error for thread:', threadUuid, error);

            const streamingThread = state[threadUuid];
            if (streamingThread) {
                streamingThread.connection = { status: 'error', error };
                streamingThread.timing.finishedAt ??= Date.now();
            }
        },
        addReasoning: {
            reducer: (
                state,
                action: PayloadAction<{
                    threadUuid: string;
                    reasoningId: string;
                    text: string;
                }>,
            ) => {
                const { threadUuid, reasoningId, text } = action.payload;
                const streamingThread = state[threadUuid];
                if (streamingThread) {
                    const existingIndex = streamingThread.reasoning.findIndex(
                        (r: Reasoning) => r.reasoningId === reasoningId,
                    );
                    if (existingIndex !== -1) {
                        const existing =
                            streamingThread.reasoning[existingIndex];

                        // Find which part this text is continuing
                        const matchingPartIndex = existing.parts.findIndex(
                            (part) => text.startsWith(part),
                        );

                        if (matchingPartIndex !== -1) {
                            // Update the matching part with longer text
                            existing.parts[matchingPartIndex] = text;
                        } else {
                            // No match found - new part
                            existing.parts.push(text);
                        }
                    } else {
                        // New reasoning
                        streamingThread.reasoning.push({
                            reasoningId,
                            parts: [text],
                        });
                    }
                }
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                reasoningId: string;
                text: string;
            }>(),
        },
        appendStepProgress: {
            reducer: (
                state,
                action: PayloadAction<{
                    threadUuid: string;
                    message: string;
                    toolName: string | null;
                    progressId?: string | null;
                    progressStatus?:
                        | 'in_progress'
                        | 'complete'
                        | 'error'
                        | null;
                }>,
            ) => {
                const {
                    threadUuid,
                    message,
                    toolName,
                    progressId = null,
                    progressStatus = null,
                } = action.payload;
                const streamingThread = state[threadUuid];
                if (!streamingThread) return;
                // Drop adjacent-duplicate step events — `runQuery` fires
                // the same "Running your query…" string per-call and we
                // don't want a stuttering list. Non-adjacent repeats are
                // fine (different cycle, different context) so we only
                // check the most recent entry. A repeat from a different
                // tool is kept (different toolName → not a true duplicate),
                // as is a repeat about a different unit of work or a status
                // transition (different progressId/progressStatus).
                const last =
                    streamingThread.stepProgressMessages[
                        streamingThread.stepProgressMessages.length - 1
                    ];
                if (
                    last &&
                    last.message === message &&
                    last.toolName === toolName &&
                    last.progressId === progressId &&
                    last.progressStatus === progressStatus
                )
                    return;
                streamingThread.stepProgressMessages.push({
                    message,
                    toolName,
                    progressId,
                    progressStatus,
                });
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                message: string;
                toolName: string | null;
                progressId?: string | null;
                progressStatus?: 'in_progress' | 'complete' | 'error' | null;
            }>(),
        },
    },
});

export const {
    startStreaming,
    markFirstToken,
    setMessage,
    setParts,
    markToolCallDecided,
    markStreamRecovering,
    markStreamPolling,
    stopStreaming,
    setError,
    addToolCall,
    addReasoning,
    appendStepProgress,
} = aiAgentThreadStreamSlice.actions;
