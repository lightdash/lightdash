import { FeatureFlags } from '@lightdash/common';
import { type FC, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import PageSpinner from '../PageSpinner';
import { isWarehouseQueryPage } from './sharedSignInListenerDecision';
import { useWarehouseSignInPreflight } from './warehouseSignInBannerState';

export const SharedSignInQueryBoundary: FC<PropsWithChildren> = ({
    children,
}) => {
    const { pathname } = useLocation();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { user } = useApp();
    const reconnect = useServerFeatureFlag(FeatureFlags.SharedSignInReconnect);
    const expiry = useServerFeatureFlag(FeatureFlags.SharedSignInExpiryMessage);
    const preflight = useWarehouseSignInPreflight();
    const pending =
        isWarehouseQueryPage(pathname) &&
        user.data?.userUuid &&
        (reconnect.isLoading ||
            expiry.isLoading ||
            (reconnect.data?.enabled &&
                expiry.data?.enabled &&
                (!activeProjectUuid ||
                    preflight?.projectUuid !== activeProjectUuid ||
                    preflight.userUuid !== user.data.userUuid)));
    return pending ? <PageSpinner /> : children;
};
