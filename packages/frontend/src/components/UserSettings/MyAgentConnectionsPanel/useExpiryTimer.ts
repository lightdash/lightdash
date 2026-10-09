import { useEffect, useState } from 'react';

export const useExpiryTimer = (expiresAt: number | null) => {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (expiresAt === null) return undefined;
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) return undefined;

        const timer = setTimeout(
            () => setTick((value) => value + 1),
            Math.min(remaining, 2 ** 31 - 1),
        );
        return () => clearTimeout(timer);
    }, [expiresAt, tick]);
};
