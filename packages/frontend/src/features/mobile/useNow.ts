import { useEffect, useState } from 'react';

export const useNow = (isTicking: boolean) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!isTicking) return undefined;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [isTicking]);
    return now;
};
