import { useSelector } from 'react-redux';
import { type AiAgentThreadStreamState } from './AiAgentThreadStreamStore';

export const useAiAgentThreadStreamQuery = (threadUuid: string) => {
    const threadStream = useSelector(
        (state: AiAgentThreadStreamState) => state.threads[threadUuid],
    );

    return threadStream;
};

export const useAiAgentThreadStreaming = (threadUuid: string) => {
    return useSelector((state: AiAgentThreadStreamState) => {
        const threadStream = state.threads[threadUuid];
        return threadStream?.isStreaming;
    });
};

export const useAiAgentThreadStreamToolCalls = (threadUuid: string) => {
    return useSelector((state: AiAgentThreadStreamState) => {
        const threadStream = state.threads[threadUuid];
        return threadStream?.toolCalls ?? [];
    });
};
