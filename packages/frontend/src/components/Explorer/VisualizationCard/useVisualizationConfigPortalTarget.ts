import { useLayoutEffect, useState } from 'react';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';

const useVisualizationConfigPortalTarget = (isOpen: boolean) => {
    const [target, setTarget] = useState<HTMLElement | null>(null);

    useLayoutEffect(() => {
        setTarget(
            isOpen
                ? document.getElementById(VisualizationConfigPortalId)
                : null,
        );
    }, [isOpen]);

    return target;
};

export default useVisualizationConfigPortalTarget;
