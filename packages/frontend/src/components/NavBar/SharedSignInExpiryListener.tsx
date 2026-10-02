import {
    FeatureFlags,
    getExpiredSharedSignInMessage,
    SignInSubjectBasis,
    type ApiError,
} from '@lightdash/common';
import { IconPlugConnected } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { getSharedSignInStatus } from '../../hooks/useReconnectSharedSignIn';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import {
    getSharedSignInExpiry,
    shouldOpenSharedSignInReconnectModal,
} from '../ProjectConnection/SharedSignIn/sharedSignInCopy';
import { SharedSignInReconnectModal } from '../ProjectConnection/SharedSignIn/SharedSignInReconnectModal';

export const SharedSignInExpiryListener: FC = () => {
    const { user } = useApp();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastWarning } = useToaster();
    const { activeProjectUuid } = useActiveProjectUuid();
    const userUuid = user.data?.userUuid ?? null;
    const reconnectFlag = useServerFeatureFlag(
        FeatureFlags.SharedSignInReconnect,
    );
    const checkedProjects = useRef(new Set<string>());
    const pendingProjects = useRef(new Set<string>());
    const openProjects = useRef(new Set<string>());
    const dismissedProjects = useRef(new Set<string>());
    const [modalProjectUuid, setModalProjectUuid] = useState<string | null>(
        null,
    );

    useEffect(() => {
        const showExpiryToast = (error: unknown) => {
            const apiError = (error as Partial<ApiError> | null)?.error;
            if (!apiError || !activeProjectUuid) return;
            const expiry = getSharedSignInExpiry(apiError);
            if (!expiry) return;
            const isSubject =
                !!userUuid &&
                expiry.subjectUserUuid === userUuid &&
                (expiry.subjectBasis === SignInSubjectBasis.RECORDED ||
                    expiry.subjectBasis === SignInSubjectBasis.PROJECT_CREATOR);
            showToastWarning({
                key: 'shared-sign-in-expired',
                title: getExpiredSharedSignInMessage(expiry, userUuid),
                autoClose: false,
                action: isSubject
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
        const notify = (error: unknown) => {
            if (!error || !activeProjectUuid) return;
            if (reconnectFlag.isLoading) return;
            if (!reconnectFlag.data?.enabled) {
                showExpiryToast(error);
                return;
            }
            if (dismissedProjects.current.has(activeProjectUuid)) return;
            if (checkedProjects.current.has(activeProjectUuid)) {
                if (pendingProjects.current.has(activeProjectUuid)) return;
                if (!openProjects.current.has(activeProjectUuid))
                    showExpiryToast(error);
                return;
            }
            checkedProjects.current.add(activeProjectUuid);
            pendingProjects.current.add(activeProjectUuid);
            const projectUuid = activeProjectUuid;
            void queryClient
                .fetchQuery({
                    queryKey: ['shared-sign-in-status', projectUuid],
                    queryFn: () => getSharedSignInStatus(projectUuid),
                    staleTime: 60_000,
                    retry: false,
                })
                .then((status) => {
                    pendingProjects.current.delete(projectUuid);
                    if (
                        shouldOpenSharedSignInReconnectModal(status) &&
                        !dismissedProjects.current.has(projectUuid)
                    ) {
                        openProjects.current.add(projectUuid);
                        setModalProjectUuid(projectUuid);
                    } else {
                        showExpiryToast(error);
                    }
                })
                .catch(() => {
                    pendingProjects.current.delete(projectUuid);
                    showExpiryToast(error);
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
        for (const query of queryClient.getQueryCache().getAll()) {
            if (query.state.status === 'error') notify(query.state.error);
        }
        return () => {
            unsubscribeQueries();
            unsubscribeMutations();
        };
    }, [
        queryClient,
        activeProjectUuid,
        userUuid,
        showToastWarning,
        navigate,
        reconnectFlag.data?.enabled,
        reconnectFlag.isLoading,
    ]);

    return modalProjectUuid ? (
        <SharedSignInReconnectModal
            projectUuid={modalProjectUuid}
            onRestored={() => {
                checkedProjects.current.delete(modalProjectUuid);
                openProjects.current.delete(modalProjectUuid);
                dismissedProjects.current.delete(modalProjectUuid);
            }}
            onClose={() => {
                dismissedProjects.current.add(modalProjectUuid);
                openProjects.current.delete(modalProjectUuid);
                setModalProjectUuid(null);
            }}
        />
    ) : null;
};
