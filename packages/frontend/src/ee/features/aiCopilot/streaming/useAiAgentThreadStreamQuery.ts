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

export const useActiveAiAgentThreadStreamParts = (): StreamPart[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.connection.status === 'streaming'
                    ? threadStream.parts
                    : [],
            ),
        shallowEqual,
    );

const EMPTY_STEER_UUIDS: string[] = [];

/** True while the run for this user message is still going (including
 *  recovery/polling), so late guidance isn't judged as dropped too early. */
export const useAiAgentThreadMessageActive = (
    threadUuid: string,
    messageUuid: string,
) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return (
            threadStream !== undefined &&
            threadStream.messageUuid === messageUuid &&
            isAiAgentThreadStreamActive(threadStream.connection)
        );
    });

export const useAiAgentThreadConsumedSteerUuids = (threadUuid: string) =>
    useAiAgentStoreSelector(
        (state) =>
            state.aiAgentThreadStream[threadUuid]?.consumedSteerUuids ??
            EMPTY_STEER_UUIDS,
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
