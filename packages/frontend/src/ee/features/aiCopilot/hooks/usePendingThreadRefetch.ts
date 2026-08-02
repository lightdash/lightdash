import {
    isToolEditDbtProjectResult,
    type ApiAiAgentThreadResponse,
} from '@lightdash/common';
import { useEffect } from 'react';
import { useAiAgentThreadStreaming } from '../streaming/useAiAgentThreadStreamQuery';

const POLL_INTERVAL_MS = 2000;

type Thread = ApiAiAgentThreadResponse['results'] | undefined;

const hasPendingWriteback = (thread: Thread): boolean =>
    thread?.messages?.some(
        (message) =>
            message.role === 'assistant' &&
            message.toolResults?.some(
                (toolResult) =>
                    isToolEditDbtProjectResult(toolResult) &&
                    toolResult.metadata.status === 'pending',
            ),
    ) ?? false;

export const usePendingThreadRefetch = (
    thread: Thread,
    threadUuid: string,
    refetch: () => unknown,
) => {
    const isStreaming = useAiAgentThreadStreaming(threadUuid);
    const isPending =
        thread?.messages?.some(
            (message) =>
                message.role === 'assistant' && message.status === 'pending',
        ) || hasPendingWriteback(thread);

    useEffect(() => {
        if (!isPending || isStreaming) return;
        const interval = setInterval(() => void refetch(), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isPending, isStreaming, refetch]);

    return { isStreaming, isPending };
};
