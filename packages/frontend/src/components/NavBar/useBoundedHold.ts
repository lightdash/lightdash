import { useEffect, useState } from 'react';

/**
 * True while `isWaiting`, but for at most `maxWaitMs` per `holdKey`, so a slow
 * or failing dependency can delay the UI briefly and never hide it.
 */
export const useBoundedHold = (
    isWaiting: boolean,
    holdKey: string | undefined,
    maxWaitMs: number,
): boolean => {
    const [expiredKey, setExpiredKey] = useState<string | undefined>();

    useEffect(() => {
        if (!isWaiting || holdKey === undefined) return undefined;
        const timeout = setTimeout(() => setExpiredKey(holdKey), maxWaitMs);
        return () => clearTimeout(timeout);
    }, [isWaiting, holdKey, maxWaitMs]);

    return isWaiting && holdKey !== undefined && expiredKey !== holdKey;
};
