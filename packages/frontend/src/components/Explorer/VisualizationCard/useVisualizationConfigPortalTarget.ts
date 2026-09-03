import { useLayoutEffect, useState } from 'react';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';

type Options = {
    // The gallery sidebar host can be replaced while open; follow it across remounts.
    followHost: boolean;
};

const useVisualizationConfigPortalTarget = (
    isOpen: boolean,
    { followHost }: Options,
) => {
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

        // On a fresh page load with the config already open, the host mounts
        // after this lookup — keep watching until one is found. Only the
        // gallery host keeps being followed across replacements after that.
        if (!followHost && target !== null) return;

        const observer = new MutationObserver(updateTarget);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [isOpen, followHost, target]);

    return target;
};

export default useVisualizationConfigPortalTarget;
