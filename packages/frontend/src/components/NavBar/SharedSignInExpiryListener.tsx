import {
    getExpiredSharedSignInMessage,
    type ApiError,
    type SharedSignInExpiry,
} from '@lightdash/common';
import { IconPlugConnected } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';
import { useNavigate } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import useApp from '../../providers/App/useApp';

const getSharedSignInExpiry = (error: unknown): SharedSignInExpiry | null => {
    const data = (error as Partial<ApiError> | null)?.error?.data as
        | { sharedSignIn?: SharedSignInExpiry }
        | undefined;
    return data?.sharedSignIn ?? null;
};

export const SharedSignInExpiryListener: FC = () => {
    const { user } = useApp();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastWarning } = useToaster();
    const { activeProjectUuid } = useActiveProjectUuid();
    const userUuid = user.data?.userUuid ?? null;

    useEffect(() => {
        const notifyOwner = (error: unknown) => {
            if (!activeProjectUuid) return;
            const expiry = getSharedSignInExpiry(error);
            if (!expiry || expiry.ownerUserUuid !== userUuid) return;
            showToastWarning({
                key: 'shared-sign-in-expired',
                title: getExpiredSharedSignInMessage(expiry, userUuid),
                action: {
                    children: 'Reconnect',
                    icon: IconPlugConnected,
                    onClick: () =>
                        navigate(
                            `/generalSettings/projectManagement/${activeProjectUuid}/settings`,
                        ),
                },
            });
        };
        const unsubscribeQueries = queryClient
            .getQueryCache()
            .subscribe((event) => {
                if (event.type === 'updated') {
                    notifyOwner(event.query.state.error);
                }
            });
        const unsubscribeMutations = queryClient
            .getMutationCache()
            .subscribe((event) => {
                if (event.type === 'updated') {
                    notifyOwner(event.mutation?.state.error);
                }
            });
        return () => {
            unsubscribeQueries();
            unsubscribeMutations();
        };
    }, [queryClient, activeProjectUuid, userUuid, showToastWarning, navigate]);

    return null;
};
