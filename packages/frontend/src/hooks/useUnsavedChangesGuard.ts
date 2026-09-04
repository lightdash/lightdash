import { useEffect } from 'react';
import { useBlocker } from 'react-router';

// Prompts before leaving with unsaved changes: the browser's native prompt on
// reload/close, and a blocker the caller renders a modal for on in-app routing.
export const useUnsavedChangesGuard = (isDirty: boolean) => {
    useEffect(() => {
        if (!isDirty) return undefined;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isDirty && currentLocation.pathname !== nextLocation.pathname,
    );

    return {
        isBlocked: blocker.state === 'blocked',
        proceed: () => blocker.proceed?.(),
        reset: () => blocker.reset?.(),
    };
};
