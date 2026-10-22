import { FeatureFlags } from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import { useLocation } from 'react-router';
import {
    clearSharedSignInToastSuppression,
    setSharedSignInToastSuppression,
} from '../../hooks/toaster/sharedSignInToastSuppression';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { shouldOpenSharedSignInReconnectModal } from '../ProjectConnection/SharedSignIn/sharedSignInCopy';
import { SharedSignInReconnectModal } from '../ProjectConnection/SharedSignIn/SharedSignInReconnectModal';
import { isWarehouseQueryPage } from './sharedSignInListenerDecision';
import { useSharedSignInStatusListener } from './useSharedSignInStatusListener';
import {
    clearWarehouseSignInPreflight,
    setWarehouseSignInPreflight,
    useWarehouseSignInBannerVisibility,
    setWarehouseSignInBanner,
} from './warehouseSignInBannerState';

export const SharedSignInExpiryListener: FC = () => {
    const { user } = useApp();
    return user.data?.userUuid ? (
        <ScopedSharedSignInExpiryListener
            key={user.data.userUuid}
            userUuid={user.data.userUuid}
        />
    ) : null;
};

const ScopedSharedSignInExpiryListener: FC<{ userUuid: string }> = ({
    userUuid,
}) => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const { pathname } = useLocation();
    const isQueryPage = isWarehouseQueryPage(pathname);
    const expiryFlag = useServerFeatureFlag(
        FeatureFlags.SharedSignInExpiryMessage,
    );
    const bannerVisible = useWarehouseSignInBannerVisibility();
    const reconnectFlag = useServerFeatureFlag(
        FeatureFlags.SharedSignInReconnect,
    );
    const lastChecks = useRef(new Map<string, number>());
    const pendingProjects = useRef(new Set<string>());
    const openProjects = useRef(new Set<string>());
    const dismissedProjects = useRef(new Set<string>());
    const currentProjectUuid = useRef(activeProjectUuid);

    useEffect(
        () => () => {
            clearWarehouseSignInPreflight();
        },
        [],
    );

    useEffect(() => {
        currentProjectUuid.current = activeProjectUuid;
    }, [activeProjectUuid]);

    const { statuses, modalProjectUuid, setModalProjectUuid } =
        useSharedSignInStatusListener({
            activeProjectUuid,
            userUuid,
            isQueryPage,
            reconnectEnabled: reconnectFlag.data?.enabled,
            expiryEnabled: expiryFlag.data?.enabled,
            flagsLoading: reconnectFlag.isLoading || expiryFlag.isLoading,
            currentProjectUuid,
            lastChecks,
            pendingProjects,
            openProjects,
            dismissedProjects,
        });

    useEffect(() => {
        const status = activeProjectUuid
            ? statuses[activeProjectUuid]
            : undefined;
        if (
            !activeProjectUuid ||
            !isQueryPage ||
            !status ||
            !expiryFlag.data?.enabled ||
            !reconnectFlag.data?.enabled
        )
            return;
        if (modalProjectUuid !== activeProjectUuid) {
            setWarehouseSignInBanner({
                projectUuid: activeProjectUuid,
                userUuid,
                status,
                reconnect: () => {
                    if (shouldOpenSharedSignInReconnectModal(status)) {
                        openProjects.current.add(activeProjectUuid);
                        setModalProjectUuid(activeProjectUuid);
                    }
                },
            });
        }
        return () => {
            setWarehouseSignInBanner(null);
        };
    }, [
        activeProjectUuid,
        statuses,
        isQueryPage,
        modalProjectUuid,
        setModalProjectUuid,
        userUuid,
        expiryFlag.data?.enabled,
        reconnectFlag.data?.enabled,
    ]);

    useEffect(() => {
        const status = activeProjectUuid
            ? statuses[activeProjectUuid]
            : undefined;
        if (!activeProjectUuid || !isQueryPage || !status) return;
        if (
            reconnectFlag.data?.enabled &&
            expiryFlag.data?.enabled &&
            (modalProjectUuid === activeProjectUuid || bannerVisible)
        ) {
            setSharedSignInToastSuppression(
                activeProjectUuid,
                status,
                userUuid,
            );
        } else {
            clearSharedSignInToastSuppression(activeProjectUuid);
        }
        return () => clearSharedSignInToastSuppression(activeProjectUuid);
    }, [
        activeProjectUuid,
        isQueryPage,
        statuses,
        modalProjectUuid,
        bannerVisible,
        userUuid,
        reconnectFlag.data?.enabled,
        expiryFlag.data?.enabled,
    ]);

    return modalProjectUuid === activeProjectUuid &&
        isQueryPage &&
        reconnectFlag.data?.enabled &&
        modalProjectUuid ? (
        <SharedSignInReconnectModal
            projectUuid={modalProjectUuid}
            personalSignIn={statuses[modalProjectUuid]?.personalSignIn}
            onRestored={() => {
                lastChecks.current.delete(modalProjectUuid);
                openProjects.current.delete(modalProjectUuid);
                dismissedProjects.current.delete(modalProjectUuid);
            }}
            onClose={() => {
                if (modalProjectUuid !== currentProjectUuid.current) return;
                setWarehouseSignInPreflight(modalProjectUuid, userUuid);
                dismissedProjects.current.add(modalProjectUuid);
                openProjects.current.delete(modalProjectUuid);
                setModalProjectUuid(null);
            }}
        />
    ) : null;
};
