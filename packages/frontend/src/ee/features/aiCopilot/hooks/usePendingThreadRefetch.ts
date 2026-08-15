import {
    AI_WRITEBACK_PENDING_GRACE_MS,
    isToolEditDbtProjectResult,
    type ApiAiAgentThreadResponse,
} from '@lightdash/common';
import { useEffect, useState } from 'react';
import { useAiAgentThreadStreaming } from '../streaming/useAiAgentThreadStreamQuery';

const POLL_INTERVAL_MS = 2000;

type Thread = ApiAiAgentThreadResponse['results'] | undefined;

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
    refetch: () => unknown,
) => {
    const isStreaming = useAiAgentThreadStreaming(threadUuid);
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
        const interval = setInterval(() => void refetch(), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isPending, isStreaming, refetch]);

    return { isStreaming, isPending };
};
