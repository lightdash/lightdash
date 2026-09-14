import { useEffect, useState } from 'react';
import { formatElapsedClock } from '../utils/formatElapsedClock';

/**
 * A ticking `0:12` for a build in flight; null when nothing is running.
 *
 * The clock is what makes a draft read as in progress rather than stuck — a
 * static "Building…" says nothing about whether it moved.
 */
export const useElapsedClock = (startedAt: Date | null): string | null => {
    // Keyed on the instant, not the object: callers derive the start from
    // server data and hand over a fresh Date every render.
    const startedAtMs = startedAt?.getTime() ?? null;
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (startedAtMs === null) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [startedAtMs]);

    if (startedAtMs === null) return null;
    return formatElapsedClock(now - startedAtMs);
};
