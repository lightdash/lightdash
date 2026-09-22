import { useCallback, useEffect, useRef, useState } from 'react';

export const useBattleFollowUpQueue = <TInput>(
    busy: boolean,
    send: (input: TInput) => Promise<unknown>,
) => {
    const [queue, setQueue] = useState<TInput[]>([]);
    const [settledCount, setSettledCount] = useState(0);
    // Holds the next send until the in-flight one settles, so a stale `busy` can't double-send.
    const sendingRef = useRef(false);

    useEffect(() => {
        if (busy || sendingRef.current || queue.length === 0) return;
        const [next, ...rest] = queue;
        sendingRef.current = true;
        setQueue(rest);
        void send(next)
            .catch(() => undefined)
            .finally(() => {
                sendingRef.current = false;
                setSettledCount((count) => count + 1);
            });
    }, [busy, queue, send, settledCount]);

    const enqueue = useCallback((input: TInput) => {
        setQueue((current) => [...current, input]);
    }, []);

    return { queuedCount: queue.length, enqueue };
};
