import { shallowEqual } from 'react-redux';
import {
    isAiAgentThreadStreamRecoveryActive,
    type StreamPart,
} from '../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreSelector } from '../store/hooks';

export const useAiAgentThreadStreamQuery = (threadUuid: string) => {
    const threadStream = useAiAgentStoreSelector((state) =>
        threadUuid in state.aiAgentThreadStream
            ? state.aiAgentThreadStream[threadUuid]
            : null,
    );

    return threadStream;
};

export const useAiAgentThreadStreaming = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream?.connection.status === 'streaming';
    });

export const useAiAgentThreadRecoveryActive = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return (
            threadStream !== undefined &&
            isAiAgentThreadStreamRecoveryActive(threadStream.connection)
        );
    });

// Keep completed parts available so batched terminal tool results are not lost.
export const useAiAgentProjectStreamParts = (
    projectUuid: string | undefined,
): StreamPart[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.projectUuid === projectUuid
                    ? threadStream.parts
                    : [],
            ),
        shallowEqual,
    );

export const useAiAgentStreamParts = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
): StreamPart[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.projectUuid === projectUuid &&
                threadStream.agentUuid === agentUuid
                    ? threadStream.parts
                    : [],
            ),
        shallowEqual,
    );

export const useAiAgentThreadMessageStreaming = (
    threadUuid: string,
    messageUuid: string,
) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return (
            threadStream?.connection.status === 'streaming' &&
            threadStream.messageUuid === messageUuid
        );
    });
