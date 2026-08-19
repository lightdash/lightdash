import {
    AI_WRITEBACK_PENDING_GRACE_MS,
    isToolEditDbtProjectResult,
    type ApiAiAgentThreadResponse,
} from '@lightdash/common';
import { useEffect, useState } from 'react';
import {
    markStreamPolling,
    stopStreaming,
} from '../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreDispatch } from '../store/hooks';
import {
    useAiAgentThreadRecoveryActive,
    useAiAgentThreadStreaming,
} from '../streaming/useAiAgentThreadStreamQuery';

const POLL_INTERVAL_MS = 5000;

type Thread = ApiAiAgentThreadResponse['results'] | undefined;
type ThreadRefetch = () => Promise<{ isError: boolean }>;

const getPendingWritebackExpiresAt = (thread: Thread): number | null => {
    const pendingExpirations =
        thread?.messages.flatMap((message) =>
            message.role === 'assistant'
                ? message.toolResults.flatMap((toolResult) => {
                      if (
                          !isToolEditDbtProjectResult(toolResult) ||
                          toolResult.metadata.status !== 'pending'
                      ) {
                          return [];
                      }

                      const createdAt =
                          toolResult.createdAt instanceof Date
                              ? toolResult.createdAt.getTime()
                              : new Date(toolResult.createdAt).getTime();
                      return Number.isFinite(createdAt)
                          ? [createdAt + AI_WRITEBACK_PENDING_GRACE_MS]
                          : [];
                  })
                : [],
        ) ?? [];

    return pendingExpirations.length > 0
        ? Math.max(...pendingExpirations)
        : null;
};

export const usePendingThreadRefetch = (
    thread: Thread,
    threadUuid: string,
    refetch: ThreadRefetch,
) => {
    const dispatch = useAiAgentStoreDispatch();
    const isStreaming = useAiAgentThreadStreaming(threadUuid);
    const isRecoveryActive = useAiAgentThreadRecoveryActive(threadUuid);
    const [expirationClock, setExpirationClock] = useState(0);
    const pendingWritebackExpiresAt = getPendingWritebackExpiresAt(thread);
    const hasPendingWriteback =
        pendingWritebackExpiresAt !== null &&
        pendingWritebackExpiresAt > Math.max(Date.now(), expirationClock);
    const isPending =
        thread?.messages?.some(
            (message) =>
                message.role === 'assistant' && message.status === 'pending',
        ) || hasPendingWriteback;

    useEffect(() => {
        if (pendingWritebackExpiresAt === null) {
            return;
        }

        const remainingMs = pendingWritebackExpiresAt - Date.now();
        if (remainingMs <= 0) {
            return;
        }

        const timeout = setTimeout(() => {
            try {
                void Promise.resolve(refetch()).catch(() => undefined);
            } catch {
                // This final refresh is best-effort; expiry must stay bounded.
            } finally {
                setExpirationClock(pendingWritebackExpiresAt);
            }
        }, remainingMs);
        return () => clearTimeout(timeout);
    }, [pendingWritebackExpiresAt, refetch]);

    useEffect(() => {
        if (!isPending || isStreaming) return;

        const pollThread = async () => {
            try {
                const result = await refetch();
                if (isRecoveryActive && !result.isError) {
                    dispatch(markStreamPolling({ threadUuid }));
                }
            } catch {
                // Keep showing the recovery alert until a refetch succeeds.
            }
        };
        const interval = setInterval(() => {
            void pollThread();
        }, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [
        dispatch,
        isPending,
        isRecoveryActive,
        isStreaming,
        refetch,
        threadUuid,
    ]);

    useEffect(() => {
        if (thread !== undefined && isRecoveryActive && !isPending) {
            dispatch(stopStreaming({ threadUuid }));
        }
    }, [dispatch, isPending, isRecoveryActive, thread, threadUuid]);

    return { isStreaming, isPending };
};
