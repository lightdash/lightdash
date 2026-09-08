import { useLayoutEffect, useState } from 'react';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';

const useVisualizationConfigPortalTarget = (isOpen: boolean) => {
    const [target, setTarget] = useState<HTMLElement | null>(null);

    useLayoutEffect(() => {
        if (!isOpen) {
            setTarget(null);
            return;
        }

        const updateTarget = () => {
            setTarget((currentTarget) => {
                const nextTarget = document.getElementById(
                    VisualizationConfigPortalId,
                );
                return currentTarget === nextTarget
                    ? currentTarget
                    : nextTarget;
            });
        };

        updateTarget();

        const observer = new MutationObserver(updateTarget);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [isOpen]);

    return target;
};

export default useVisualizationConfigPortalTarget;
