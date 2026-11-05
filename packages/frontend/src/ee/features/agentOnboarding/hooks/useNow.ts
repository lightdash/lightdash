import { useEffect, useState } from 'react';

/** Current time, ticking every second while the run is live */
export const useNow = (isLive: boolean) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!isLive) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [isLive]);
    return now;
};
