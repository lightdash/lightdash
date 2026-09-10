import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a function whose identity never changes and always invokes the
 * latest `callback`, for consumers that restart when a callback changes.
 */
export const useStableCallback = <Args extends unknown[], Result>(
    callback: (...args: Args) => Result,
) => {
    const latest = useRef(callback);

    useLayoutEffect(() => {
        latest.current = callback;
    });

    return useCallback((...args: Args) => latest.current(...args), []);
};
