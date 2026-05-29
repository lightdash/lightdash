import {
    type AiAgentToolName,
    type AiMcpServerConnectionStatus,
} from '@lightdash/common';
import {
    createSlice,
    prepareAutoBatched,
    type PayloadAction,
} from '@reduxjs/toolkit';

type ToolCall = {
    toolCallId: string;
    toolName: AiAgentToolName;
    toolArgs: unknown;
};

type Reasoning = {
    reasoningId: string;
    parts: string[];
};

export type McpUnavailableNotice = {
    serverUuid: string;
    serverName: string;
    message: string;
    status: AiMcpServerConnectionStatus;
};

export type StreamPart =
    | { type: 'text'; text: string }
    | {
          type: 'toolCall';
          toolCallId: string;
          toolName: AiAgentToolName;
          toolArgs: unknown;
          /**
           * The tool's output once the call resolves. Populated for live
           * preliminary updates (tools whose execute is an async generator
           * like `discoverFields`) and for the final non-preliminary result.
           * `undefined` while the tool is still streaming its input or before
           * the first preliminary chunk lands.
           */
          toolOutput?: unknown;
          /**
           * `true` for AI-SDK preliminary tool-result chunks (each yield from
           * an async-generator execute). `false` for the final non-preliminary
           * tool result. `undefined` when toolOutput is absent.
           */
          isPreliminary?: boolean;
      };

export interface AiAgentThreadStreamingState {
    threadUuid: string;
    messageUuid: string;
    content: string;
    parts: StreamPart[];
    isStreaming: boolean;
    toolCalls: ToolCall[];
    reasoning: Reasoning[];
    decidedToolCallIds: string[];
    mcpUnavailableNotices: McpUnavailableNotice[];
    /**
     * Ordered history of step-progress strings emitted by the agent's
     * tools (e.g. "Starting sandbox…", "Cloning project…", "Editing
     * models…"). Each `data-step-progress` SSE chunk is appended here
     * (with adjacent-duplicate dedup). The bubble surfaces only the
     * latest entry as the active step under the running tool group;
     * keeping the full history in state means we can revisit the
     * presentation (timeline, summary on hover, etc.) without changing
     * the wire protocol. Slack overwrites a single pinned message — web
     * has scroll space, but we mimic Slack's single-row replacement for
     * now to keep the bubble compact.
     */
    stepProgressMessages: string[];
    error?: string;
    improveContextNotification?: {
        toolCallId: string;
        suggestedInstruction: string;
    };
}

type State = Record<string, AiAgentThreadStreamingState>;

const initialState: State = {};
const initialThread: Omit<
    AiAgentThreadStreamingState,
    'threadUuid' | 'messageUuid'
> = {
    content: '',
    parts: [],
    isStreaming: true,
    toolCalls: [],
    reasoning: [],
    decidedToolCallIds: [],
    mcpUnavailableNotices: [],
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
            };
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
                    streamingThread.parts = parts;
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
        stopStreaming: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const { threadUuid } = action.payload;

            const streamingThread = state[threadUuid];
            if (streamingThread) {
                streamingThread.isStreaming = false;
            }
        },
        addToolCall: {
            reducer: (
                state,
                action: PayloadAction<ToolCall & { threadUuid: string }>,
            ) => {
                const { threadUuid, toolCallId, toolName, toolArgs } =
                    action.payload;
                const streamingThread = state[threadUuid];
                if (streamingThread) {
                    const existingIndex = streamingThread.toolCalls.findIndex(
                        (tc: ToolCall) => tc.toolCallId === toolCallId,
                    );
                    if (existingIndex !== -1) {
                        streamingThread.toolCalls[existingIndex] = {
                            ...streamingThread.toolCalls[existingIndex],
                            toolName,
                            toolArgs,
                        };
                    } else {
                        streamingThread.toolCalls.push({
                            toolCallId,
                            toolName,
                            toolArgs,
                        });
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
                streamingThread.isStreaming = false;
                streamingThread.error = error;
            }
        },
        setImproveContextNotification: {
            reducer: (
                state,
                action: PayloadAction<{
                    threadUuid: string;
                    toolCallId: string;
                    suggestedInstruction: string;
                }>,
            ) => {
                const { threadUuid, toolCallId, suggestedInstruction } =
                    action.payload;
                const streamingThread = state[threadUuid];
                if (streamingThread) {
                    streamingThread.improveContextNotification = {
                        toolCallId,
                        suggestedInstruction,
                    };
                }
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                toolCallId: string;
                suggestedInstruction: string;
            }>(),
        },
        clearImproveContextNotification: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const { threadUuid } = action.payload;
            const streamingThread = state[threadUuid];
            if (streamingThread) {
                streamingThread.improveContextNotification = undefined;
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
                }>,
            ) => {
                const { threadUuid, message } = action.payload;
                const streamingThread = state[threadUuid];
                if (!streamingThread) return;
                // Drop adjacent-duplicate step events — `runQuery` fires
                // the same "Running your query…" string per-call and we
                // don't want a stuttering list. Non-adjacent repeats are
                // fine (different cycle, different context) so we only
                // check the most recent entry.
                const last =
                    streamingThread.stepProgressMessages[
                        streamingThread.stepProgressMessages.length - 1
                    ];
                if (last === message) return;
                streamingThread.stepProgressMessages.push(message);
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                message: string;
            }>(),
        },
        addMcpUnavailableNotice: {
            reducer: (
                state,
                action: PayloadAction<{
                    threadUuid: string;
                    notice: McpUnavailableNotice;
                }>,
            ) => {
                const { threadUuid, notice } = action.payload;
                const streamingThread = state[threadUuid];
                if (
                    streamingThread &&
                    !streamingThread.mcpUnavailableNotices.some(
                        (existingNotice) =>
                            existingNotice.serverUuid === notice.serverUuid,
                    )
                ) {
                    streamingThread.mcpUnavailableNotices.push(notice);
                }
            },
            prepare: prepareAutoBatched<{
                threadUuid: string;
                notice: McpUnavailableNotice;
            }>(),
        },
    },
});

export const {
    startStreaming,
    setMessage,
    setParts,
    markToolCallDecided,
    stopStreaming,
    setError,
    addToolCall,
    addReasoning,
    addMcpUnavailableNotice,
    setImproveContextNotification,
    clearImproveContextNotification,
    appendStepProgress,
} = aiAgentThreadStreamSlice.actions;
