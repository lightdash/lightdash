import { useContext } from 'react';
import { PortalTargetContext } from './PortalTargetContext';

/** Target for `createPortal` calls that bypass Mantine's Portal.
 *  Looked up on every render on purpose: during a tree's first render the
 *  SDK container is not in the DOM yet, so memoising would pin `document.body`. */
export const usePortalTarget = (): HTMLElement => {
    const selector = useContext(PortalTargetContext);
    return (
        (selector ? document.querySelector<HTMLElement>(selector) : null) ??
        document.body
    );
};
