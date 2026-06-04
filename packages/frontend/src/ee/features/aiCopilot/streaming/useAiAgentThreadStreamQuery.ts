import { shallowEqual } from 'react-redux';
import { type StreamPart } from '../store/aiAgentThreadStreamSlice';
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
        return threadStream?.isStreaming;
    });

export const useActiveAiAgentThreadStreamParts = (): StreamPart[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.isStreaming ? threadStream.parts : [],
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
            threadStream?.isStreaming &&
            threadStream?.messageUuid === messageUuid
        );
    });
