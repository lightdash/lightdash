import { shallowEqual } from 'react-redux';
import {
    isAiAgentThreadStreamActive,
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

export const useAiAgentMessageStream = (
    threadUuid: string,
    messageUuid: string,
) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream?.messageUuid === messageUuid ? threadStream : null;
    });

export const useAiAgentThreadStreaming = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream?.connection.status === 'streaming';
    });

export const useAiAgentThreadActiveMessageUuid = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream &&
            isAiAgentThreadStreamActive(threadStream.connection)
            ? threadStream.messageUuid
            : null;
    });

export const useAiAgentThreadRecoveryActive = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return (
            threadStream !== undefined &&
            isAiAgentThreadStreamRecoveryActive(threadStream.connection)
        );
    });

type StreamToolCallPart = Extract<StreamPart, { type: 'toolCall' }>;

const isFinalToolCallPart = (part: StreamPart): part is StreamToolCallPart =>
    part.type === 'toolCall' && part.isPreliminary === false;

const haveSameToolCallIds = (
    a: StreamToolCallPart[],
    b: StreamToolCallPart[],
) =>
    a.length === b.length &&
    a.every((part, index) => part.toolCallId === b[index].toolCallId);

// Final tool results never change, so streamed text does not re-render callers.
// Completed threads stay included so batched terminal tool results are not lost.
export const useAiAgentProjectFinalToolCalls = (
    projectUuid: string | undefined,
): StreamToolCallPart[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.projectUuid === projectUuid
                    ? threadStream.parts.filter(isFinalToolCallPart)
                    : [],
            ),
        haveSameToolCallIds,
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
