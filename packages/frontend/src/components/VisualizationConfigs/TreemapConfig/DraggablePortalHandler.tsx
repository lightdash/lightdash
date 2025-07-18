import { type DraggableStateSnapshot } from '@hello-pangea/dnd';
import { type FC } from 'react';
import { createPortal } from 'react-dom';

type DraggablePortalHandlerProps = {
    snapshot: DraggableStateSnapshot;
};

/**
 * A component that renders its children in a portal when dragging.
 * This helps avoid positioning issues with drag and drop.
 */
export const DraggablePortalHandler: FC<
    React.PropsWithChildren<DraggablePortalHandlerProps>
> = ({ children, snapshot }) => {
    if (snapshot.isDragging) return createPortal(children, document.body);
    return <>{children}</>;
};
