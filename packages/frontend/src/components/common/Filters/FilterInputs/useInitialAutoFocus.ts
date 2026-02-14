import { useRef } from 'react';

/**
 * Hook that returns true only on the first render (for autoFocus),
 * and false on subsequent renders to prevent focus jumping.
 *
 * This solves the issue where multiple inputs with autoFocus={true}
 * cause the UI to jump to the last input on every re-render.
 */
export const useInitialAutoFocus = (): boolean => {
    const hasBeenMounted = useRef(false);

    if (!hasBeenMounted.current) {
        hasBeenMounted.current = true;
        return true;
    }

    return false;
};
