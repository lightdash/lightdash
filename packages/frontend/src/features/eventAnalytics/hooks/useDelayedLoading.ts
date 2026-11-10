import { useEffect, useState } from 'react';

const DELAY_MS = 200;

/** Reports loading only after a short delay, so fast queries don't flash a spinner. */
export function useDelayedLoading(isLoading: boolean): boolean {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!isLoading) {
            setShow(false);
            return undefined;
        }
        const timer = setTimeout(() => setShow(true), DELAY_MS);
        return () => clearTimeout(timer);
    }, [isLoading]);

    return show;
}
