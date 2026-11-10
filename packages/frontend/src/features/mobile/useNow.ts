import { useEffect, useState } from 'react';

export const useNow = (isTicking: boolean) => {
    const [now, setNow] = useState(() => performance.now());
    useEffect(() => {
        if (!isTicking) return undefined;
        setNow(performance.now());
        const timer = window.setInterval(() => setNow(performance.now()), 1000);
        return () => window.clearInterval(timer);
    }, [isTicking]);
    return now;
};
