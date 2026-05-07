import { type ApiAiAgentThreadResponse } from '@lightdash/common';
import { useEffect } from 'react';
import { useAiAgentThreadStreaming } from '../streaming/useAiAgentThreadStreamQuery';

const POLL_INTERVAL_MS = 2000;

type Thread = ApiAiAgentThreadResponse['results'] | undefined;

/**
 * Polls the thread query while there is a pending assistant message and no
 * active stream — covers the gap between submission and the first stream
 * chunk, and the case where the stream never connects (e.g. Slack-created
 * threads).
 */
export const usePendingThreadRefetch = (
    thread: Thread,
    threadUuid: string,
    refetch: () => unknown,
) => {
    const isStreaming = useAiAgentThreadStreaming(threadUuid);
    const isPending = thread?.messages?.some(
        (message) =>
            message.role === 'assistant' && message.status === 'pending',
    );

    useEffect(() => {
        if (!isPending || isStreaming) return;
        const interval = setInterval(() => void refetch(), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isPending, isStreaming, refetch]);

    return { isStreaming, isPending };
};
