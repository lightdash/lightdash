import { type AnyType } from '@lightdash/common';
import {
    configureStore,
    createSlice,
    type PayloadAction,
} from '@reduxjs/toolkit';

interface ToolCall {
    toolCallId: string;
    toolName: string;
    args: Record<string, AnyType>;
    isStreaming?: boolean;
}

export interface StreamingState {
    threadUuid: string;
    content: string;
    isStreaming: boolean;
    toolCalls: ToolCall[];
    error?: string;
}

type State = Record<string, StreamingState>;

const initialState: State = {};
const initialThread: Omit<StreamingState, 'threadUuid'> = {
    content: '',
    isStreaming: true,
    toolCalls: [],
};

const threadStreamSlice = createSlice({
    name: 'threadStream',
    initialState,
    reducers: {
        startStreaming: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const { threadUuid } = action.payload;

            state[threadUuid] = {
                threadUuid,
                ...initialThread,
            };
        },
        appendToMessage: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                content: string;
            }>,
        ) => {
            const { threadUuid, content } = action.payload;

            const streamingThread = state[threadUuid];
            if (streamingThread) {
                streamingThread.content += content;
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

            state[threadUuid].isStreaming = false;
        },
        addToolCall: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                toolCallId: string;
                toolName: string;
                args: Record<string, any>;
            }>,
        ) => {
            const { threadUuid, toolCallId, toolName, args } = action.payload;
            const streamingThread = state[threadUuid];
            if (streamingThread) {
                const existingIndex = streamingThread.toolCalls.findIndex(
                    (tc) => tc.toolCallId === toolCallId,
                );
                if (existingIndex !== -1) {
                    streamingThread.toolCalls[existingIndex] = {
                        ...streamingThread.toolCalls[existingIndex],
                        toolName,
                        args,
                    };
                } else {
                    streamingThread.toolCalls.push({
                        toolCallId,
                        toolName,
                        args,
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
    },
});

export const {
    startStreaming,
    appendToMessage,
    stopStreaming,
    setError,
    addToolCall,
} = threadStreamSlice.actions;

export const store = configureStore({
    reducer: {
        threads: threadStreamSlice.reducer,
    },
});

export type AiAgentThreadStreamState = ReturnType<typeof store.getState>;
export type AiAgentThreadStreamDispatch = typeof store.dispatch;
