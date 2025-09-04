import { useAppSelector } from '../store/hooks';

export const useAiAgentThreadStreamQuery = (threadUuid: string) => {
    const threadStream = useAppSelector((state) =>
        threadUuid in state.aiAgentThreadStream
            ? state.aiAgentThreadStream[threadUuid]
            : null,
    );

    return threadStream;
};

export const useAiAgentThreadStreaming = (threadUuid: string) =>
    useAppSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream?.isStreaming;
    });

export const useAiAgentThreadMessageStreaming = (
    threadUuid: string,
    messageUuid: string,
) =>
    useAppSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return (
            threadStream?.isStreaming &&
            threadStream?.messageUuid === messageUuid
        );
    });
