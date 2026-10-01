import {
    getExpiredSharedSignInMessage,
    type ApiError,
} from '@lightdash/common';
import { IconPlugConnected } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';
import { useNavigate } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import useApp from '../../providers/App/useApp';
import { getSharedSignInExpiry } from '../ProjectConnection/SharedSignIn/sharedSignInCopy';

export const SharedSignInExpiryListener: FC = () => {
    const { user } = useApp();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastWarning } = useToaster();
    const { activeProjectUuid } = useActiveProjectUuid();
    const userUuid = user.data?.userUuid ?? null;

    useEffect(() => {
        const notify = (error: unknown) => {
            const apiError = (error as Partial<ApiError> | null)?.error;
            if (!apiError || !activeProjectUuid) return;
            const expiry = getSharedSignInExpiry(apiError);
            if (!expiry) return;
            const isOwner = !!userUuid && expiry.ownerUserUuid === userUuid;
            showToastWarning({
                key: 'shared-sign-in-expired',
                title: getExpiredSharedSignInMessage(expiry, userUuid),
                autoClose: false,
                action: isOwner
                    ? {
                          children: 'Reconnect',
                          icon: IconPlugConnected,
                          onClick: () =>
                              navigate(
                                  `/generalSettings/projectManagement/${activeProjectUuid}/settings`,
                              ),
                      }
                    : undefined,
            });
        };
        const unsubscribeQueries = queryClient
            .getQueryCache()
            .subscribe((event) => {
                if (event.type === 'updated') notify(event.query.state.error);
            });
        const unsubscribeMutations = queryClient
            .getMutationCache()
            .subscribe((event) => {
                if (event.type === 'updated') {
                    notify(event.mutation?.state.error);
                }
            });
        return () => {
            unsubscribeQueries();
            unsubscribeMutations();
        };
    }, [queryClient, activeProjectUuid, userUuid, showToastWarning, navigate]);

    return null;
};
