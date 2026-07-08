import {
    isToolEditDbtProjectResult,
    type ApiAiAgentThreadResponse,
} from '@lightdash/common';
import { useEffect } from 'react';
import { useAiAgentThreadStreaming } from '../streaming/useAiAgentThreadStreamQuery';

const POLL_INTERVAL_MS = 2000;

type Thread = ApiAiAgentThreadResponse['results'] | undefined;

// SPK-548: editDbtProject now enqueues the writeback run and returns
// immediately (status 'pending') instead of awaiting it, so the model's turn
// — and the assistant message itself — completes normally while the PR card
// is still working in the background. The stored tool-call metadata is
// rewritten to its terminal state once the background run finishes (see
// AiAgentService.runEditDbtProjectPipeline), so polling here just needs to
// keep re-fetching the thread until that rewrite has landed.
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

/**
 * Polls the thread query while there is a pending assistant message, an
 * in-progress background writeback run, and no active stream — covers the
 * gap between submission and the first stream chunk, the case where the
 * stream never connects (e.g. Slack-created threads), and a writeback PR
 * card left showing "pending" after the model's turn already ended.
 */
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
