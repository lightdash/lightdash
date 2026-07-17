import { useEffect, useState } from 'react';

export const useAnimation = (intervalMs: number): number => {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((currentFrame) => currentFrame + 1);
        }, intervalMs);

        return () => clearInterval(interval);
    }, [intervalMs]);

    return frame;
};
