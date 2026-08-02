import { useEffect, useState } from 'react';
import { formatElapsedClock } from '../utils/formatElapsedClock';

/**
 * A ticking `0:12` for a build in flight; null when nothing is running.
 *
 * The clock is what makes a draft read as in progress rather than stuck — a
 * static "Building…" says nothing about whether it moved.
 */
export const useElapsedClock = (startedAt: Date | null): string | null => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (startedAt === null) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [startedAt]);

    if (startedAt === null) return null;
    return formatElapsedClock(now - startedAt.getTime());
};
