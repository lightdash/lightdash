import {
    configureStore,
    createSlice,
    type PayloadAction,
} from '@reduxjs/toolkit';

export interface StreamingState {
    threadUuid: string;
    content: string;
    isStreaming: boolean;
    error?: string;
}

type threadUuid = string;
type State = Record<threadUuid, StreamingState>;

const initialState: State = {};

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
                content: '',
                isStreaming: true,
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

export const { startStreaming, appendToMessage, stopStreaming, setError } =
    threadStreamSlice.actions;

export const store = configureStore({
    reducer: {
        threads: threadStreamSlice.reducer,
    },
});

export type AiAgentThreadStreamState = ReturnType<typeof store.getState>;
export type AiAgentThreadStreamDispatch = typeof store.dispatch;
