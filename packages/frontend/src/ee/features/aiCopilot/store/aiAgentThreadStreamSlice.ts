import { type ToolName } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type ToolCall = {
    toolCallId: string;
    toolName: ToolName;
    toolArgs: unknown;
};

type Reasoning = {
    reasoningId: string;
    parts: string[];
};

export interface AiAgentThreadStreamingState {
    threadUuid: string;
    messageUuid: string;
    content: string;
    isStreaming: boolean;
    toolCalls: ToolCall[];
    reasoning: Reasoning[];
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
    isStreaming: true,
    toolCalls: [],
    reasoning: [],
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
        setMessage: (
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
        addToolCall: (
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
        setImproveContextNotification: (
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
        addReasoning: (
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
                    const existing = streamingThread.reasoning[existingIndex];

                    // Find which part this text is continuing
                    const matchingPartIndex = existing.parts.findIndex((part) =>
                        text.startsWith(part),
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
    },
});

export const {
    startStreaming,
    setMessage,
    stopStreaming,
    setError,
    addToolCall,
    addReasoning,
    setImproveContextNotification,
    clearImproveContextNotification,
} = aiAgentThreadStreamSlice.actions;
