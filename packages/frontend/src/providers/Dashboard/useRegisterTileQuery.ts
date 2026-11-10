import { useEffect } from 'react';
import { type TileQueryRegistration } from '../../features/dashboard/store/dashboardTileStatusReducer';
import useDashboardTileStatusContext from './useDashboardTileStatusContext';

/**
 * Publishes a chart/SQL tile's query into the analysis source registry while
 * it has one. Pass null while the tile is still loading; the registration is
 * replaced on change and removed on unmount.
 */
export const useRegisterTileQuery = (
    registration: TileQueryRegistration | null,
): void => {
    const registerTileQuery = useDashboardTileStatusContext(
        (c) => c.registerTileQuery,
    );
    const unregisterTileQuery = useDashboardTileStatusContext(
        (c) => c.unregisterTileQuery,
    );
    const tileUuid = registration?.tileUuid;
    const queryUuid = registration?.queryUuid ?? null;
    const label = registration?.label ?? null;
    const status = registration?.status ?? null;
    useEffect(() => {
        if (!tileUuid || status === null) {
            return undefined;
        }
        registerTileQuery({
            tileUuid,
            queryUuid,
            label: label ?? '',
            status,
        });
        return () => unregisterTileQuery(tileUuid);
    }, [
        tileUuid,
        queryUuid,
        label,
        status,
        registerTileQuery,
        unregisterTileQuery,
    ]);
};
