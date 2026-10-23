import { FeatureFlags } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import {
    clearSharedSignInToastSuppression,
    setSharedSignInToastSuppression,
} from '../../hooks/toaster/sharedSignInToastSuppression';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { SharedSignInReconnectModal } from '../ProjectConnection/SharedSignIn/SharedSignInReconnectModal';
import { useSharedSignInStatusListener } from './useSharedSignInStatusListener';
import {
    setWarehouseSignInBanner,
    useWarehouseSignInBannerVisibility,
} from './warehouseSignInBannerState';

export const SharedSignInExpiryListener: FC = () => {
    const reconnectFlag = useServerFeatureFlag(
        FeatureFlags.SharedSignInReconnect,
    );
    const expiryFlag = useServerFeatureFlag(
        FeatureFlags.SharedSignInExpiryMessage,
    );
    const bannerVisible = useWarehouseSignInBannerVisibility();
    const store = useSharedSignInStatusListener({
        reconnectEnabled: reconnectFlag.data?.enabled,
        flagsLoading: reconnectFlag.isLoading || expiryFlag.isLoading,
    });
    const target = store?.target;
    const modalOpen = !!store?.modalOpen;
    useEffect(() => {
        if (!target || !store || !store.enabled || modalOpen) return;
        setWarehouseSignInBanner({
            projectUuid: target.projectUuid,
            userUuid: target.userUuid,
            status: target.status,
            reconnect: () => {
                if (
                    !store.isCurrent(target) ||
                    !store.hasPreferredBinding(target.binding)
                )
                    return;
                if (
                    target.status.personalSignIn?.canReconnect ??
                    target.status.canReconnect
                ) {
                    store.modalOpen = true;
                    store.checks.get(target.binding ?? 'original')!.blocked =
                        true;
                    store.notify();
                }
            },
        });
        return () => setWarehouseSignInBanner(null);
    }, [store, target, modalOpen]);
    useEffect(() => {
        if (
            !target ||
            !reconnectFlag.data?.enabled ||
            (target.status.personalSignIn && !store?.enabled)
        )
            return;
        if (modalOpen || bannerVisible)
            setSharedSignInToastSuppression(
                target.projectUuid,
                target.status,
                target.userUuid,
            );
        else clearSharedSignInToastSuppression(target.projectUuid);
        return () => clearSharedSignInToastSuppression(target.projectUuid);
    }, [store, target, modalOpen, bannerVisible, reconnectFlag.data?.enabled]);
    const displayEnabled =
        reconnectFlag.data?.enabled &&
        (!target?.status.personalSignIn || expiryFlag.data?.enabled);
    return displayEnabled && store && target && modalOpen ? (
        <SharedSignInReconnectModal
            key={`${target.pageGeneration}:${target.generation}`}
            projectUuid={target.projectUuid}
            personalSignIn={target.status.personalSignIn}
            target={target}
            onClose={() => store.dismiss(target)}
        />
    ) : null;
};
