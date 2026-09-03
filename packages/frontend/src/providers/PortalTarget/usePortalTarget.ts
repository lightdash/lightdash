import { useContext } from 'react';
import { PortalTargetContext } from './PortalTargetContext';

/** Target for `createPortal` calls that bypass Mantine's Portal. */
export const usePortalTarget = (): HTMLElement => {
    const selector = useContext(PortalTargetContext);
    return (
        (selector ? document.querySelector<HTMLElement>(selector) : null) ??
        document.body
    );
};
