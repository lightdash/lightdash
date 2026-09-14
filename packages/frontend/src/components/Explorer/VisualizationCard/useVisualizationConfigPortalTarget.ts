import { useLayoutEffect, useState } from 'react';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';

const useVisualizationConfigPortalTarget = (isOpen: boolean) => {
    const [sourceElement, setSourceElement] = useState<HTMLElement | null>(
        null,
    );
    const [target, setTarget] = useState<HTMLElement | null>(null);

    useLayoutEffect(() => {
        const root = sourceElement?.getRootNode();
        if (
            !isOpen ||
            !(root instanceof Document || root instanceof ShadowRoot)
        ) {
            setTarget(null);
            return;
        }

        const updateTarget = () => {
            setTarget((currentTarget) => {
                const nextTarget = root.getElementById(
                    VisualizationConfigPortalId,
                );
                return currentTarget === nextTarget
                    ? currentTarget
                    : nextTarget;
            });
        };

        updateTarget();

        const observer = new MutationObserver(updateTarget);
        observer.observe(root, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [isOpen, sourceElement]);

    return { target, ref: setSourceElement };
};

export default useVisualizationConfigPortalTarget;
