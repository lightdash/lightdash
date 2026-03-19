import { type FC, type ReactNode } from 'react';
import { useTileViewportObserver } from '../hooks/useTileViewportObserver';

interface Props {
    tileUuid: string;
    children: ReactNode;
}

/**
 * Wraps a dashboard tile's grid cell div with an IntersectionObserver
 * that triggers progressive loading when the tile enters the viewport.
 */
const ObservedTileWrapper: FC<Props> = ({ tileUuid, children }) => {
    const observerRef = useTileViewportObserver(tileUuid);

    return (
        <div
            ref={observerRef}
            data-tile-uuid={tileUuid}
            style={{ height: '100%', width: '100%' }}
        >
            {children}
        </div>
    );
};

export default ObservedTileWrapper;
