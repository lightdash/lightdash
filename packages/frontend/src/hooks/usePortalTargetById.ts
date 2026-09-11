import { useLayoutEffect, useState } from 'react';

/**
 * The element a portal renders into, looked up by id. The host may mount,
 * remount or be replaced after this hook runs, so the lookup is repeated
 * whenever the document tree changes.
 */
export const usePortalTargetById = (id: string, enabled = true) => {
    const [target, setTarget] = useState<HTMLElement | null>(null);

    useLayoutEffect(() => {
        if (!enabled) {
            setTarget(null);
            return;
        }

        const updateTarget = () => {
            setTarget((currentTarget) => {
                const nextTarget = document.getElementById(id);
                return currentTarget === nextTarget
                    ? currentTarget
                    : nextTarget;
            });
        };

        updateTarget();

        const observer = new MutationObserver(updateTarget);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [id, enabled]);

    return target;
};
