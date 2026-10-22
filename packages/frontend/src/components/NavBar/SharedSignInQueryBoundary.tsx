import { FeatureFlags } from '@lightdash/common';
import {
    useLayoutEffect,
    useMemo,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { isWarehouseQueryPage } from './sharedSignInListenerDecision';
import {
    activateWarehouseSignInPreflight,
    WarehouseSignInPreflight,
    WarehouseSignInPreflightContext,
    WarehouseSignInStatusCache,
} from './warehouseSignInPreflight';

export const SharedSignInQueryBoundary: FC<PropsWithChildren> = ({
    children,
}) => {
    const { pathname } = useLocation();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { user } = useApp();
    const reconnect = useServerFeatureFlag(FeatureFlags.SharedSignInReconnect);
    const expiry = useServerFeatureFlag(FeatureFlags.SharedSignInExpiryMessage);
    const userUuid = user.data?.userUuid;
    const enabled = !!reconnect.data?.enabled && !!expiry.data?.enabled;
    const loading = reconnect.isLoading || expiry.isLoading;
    const statusCache = useMemo(
        () => new WarehouseSignInStatusCache(userUuid),
        [userUuid],
    );
    const store = useMemo(
        () =>
            activeProjectUuid && userUuid && isWarehouseQueryPage(pathname)
                ? new WarehouseSignInPreflight(
                      {
                          projectUuid: activeProjectUuid,
                          userUuid,
                          pageGeneration: crypto.randomUUID(),
                      },
                      enabled,
                      loading,
                      statusCache,
                  )
                : null,
        [activeProjectUuid, userUuid, pathname, enabled, loading, statusCache],
    );
    useLayoutEffect(
        () => (store ? activateWarehouseSignInPreflight(store) : undefined),
        [store],
    );
    return (
        <WarehouseSignInPreflightContext.Provider value={store}>
            {children}
        </WarehouseSignInPreflightContext.Provider>
    );
};
