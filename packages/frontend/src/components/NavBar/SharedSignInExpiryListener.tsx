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
import {
    clearSharedSignInToastSuppression,
    setSharedSignInToastSuppression,
} from '../../hooks/toaster/sharedSignInToastSuppression';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import {
    getSharedSignInStatus,
    SHARED_SIGN_IN_QUERY_FAILED,
} from '../../hooks/useReconnectSharedSignIn';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import {
    getSharedSignInExpiry,
    shouldOpenSharedSignInReconnectModal,
} from '../ProjectConnection/SharedSignIn/sharedSignInCopy';
import { SharedSignInReconnectModal } from '../ProjectConnection/SharedSignIn/SharedSignInReconnectModal';
import {
    queryBelongsToProject,
    scheduleSharedSignInCooldownCheck,
    shouldCheckSharedSignInStatus,
    shouldUseSharedSignInStatus,
} from './sharedSignInListenerDecision';

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
    const lastChecks = useRef(new Map<string, number>());
    const pendingProjects = useRef(new Set<string>());
    const openProjects = useRef(new Set<string>());
    const dismissedProjects = useRef(new Set<string>());
    const currentProjectUuid = useRef(activeProjectUuid);
    const [modalProjectUuid, setModalProjectUuid] = useState<string | null>(
        null,
    );

    useEffect(() => {
        currentProjectUuid.current = activeProjectUuid;
    }, [activeProjectUuid]);

    useEffect(() => {
        if (!modalProjectUuid) return;
        return () => clearSharedSignInToastSuppression(modalProjectUuid);
    }, [modalProjectUuid]);

    useEffect(() => {
        if (!activeProjectUuid) return;
        let trailingCheck: ReturnType<typeof setTimeout> | null = null;
        const clearTrailingCheck = () => {
            if (trailingCheck) clearTimeout(trailingCheck);
            trailingCheck = null;
        };
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
                projectUuid: expiry.projectUuid,
                title: getExpiredSharedSignInMessage(expiry, userUuid),
                autoClose: false,
                action: isSubject
                    ? {
                          children: 'Reconnect',
                          icon: IconPlugConnected,
                          onClick: () =>
                              navigate(
                                  `/generalSettings/projectManagement/${expiry.projectUuid}/settings`,
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
            if (
                !shouldCheckSharedSignInStatus({
                    projectUuid: activeProjectUuid,
                    pendingProjects: pendingProjects.current,
                    openProjects: openProjects.current,
                    dismissedProjects: dismissedProjects.current,
                    lastChecks: lastChecks.current,
                    now: Date.now(),
                })
            ) {
                const lastCheck = lastChecks.current.get(activeProjectUuid);
                if (
                    lastCheck !== undefined &&
                    Date.now() - lastCheck < 60_000 &&
                    !openProjects.current.has(activeProjectUuid) &&
                    !dismissedProjects.current.has(activeProjectUuid)
                ) {
                    clearTrailingCheck();
                    const runTrailing = () => {
                        if (pendingProjects.current.has(activeProjectUuid)) {
                            trailingCheck = setTimeout(runTrailing, 100);
                        } else {
                            notify(error);
                        }
                    };
                    trailingCheck = scheduleSharedSignInCooldownCheck(
                        lastCheck,
                        runTrailing,
                    );
                }
                return;
            }
            clearTrailingCheck();
            lastChecks.current.set(activeProjectUuid, Date.now());
            pendingProjects.current.add(activeProjectUuid);
            const projectUuid = activeProjectUuid;
            void queryClient
                .fetchQuery({
                    queryKey: ['shared-sign-in-status', projectUuid],
                    queryFn: () => getSharedSignInStatus(projectUuid),
                    staleTime: 0,
                    retry: false,
                })
                .then((status) => {
                    pendingProjects.current.delete(projectUuid);
                    if (
                        !shouldUseSharedSignInStatus(
                            projectUuid,
                            currentProjectUuid.current,
                            dismissedProjects.current,
                        )
                    )
                        return;
                    if (shouldOpenSharedSignInReconnectModal(status)) {
                        openProjects.current.add(projectUuid);
                        setSharedSignInToastSuppression(
                            projectUuid,
                            status,
                            userUuid,
                        );
                        setModalProjectUuid(projectUuid);
                    } else {
                        showExpiryToast(error);
                    }
                })
                .catch(() => {
                    pendingProjects.current.delete(projectUuid);
                    if (projectUuid === currentProjectUuid.current)
                        showExpiryToast(error);
                });
        };
        const unsubscribeQueries = queryClient
            .getQueryCache()
            .subscribe((event) => {
                if (
                    event.type === 'updated' &&
                    queryBelongsToProject(
                        event.query.queryKey,
                        activeProjectUuid,
                    )
                )
                    notify(event.query.state.error);
            });
        const unsubscribeMutations = queryClient
            .getMutationCache()
            .subscribe((event) => {
                if (
                    event.type === 'updated' &&
                    queryBelongsToProject(
                        event.mutation.options.mutationKey,
                        activeProjectUuid,
                    )
                ) {
                    notify(event.mutation?.state.error);
                }
            });
        for (const query of queryClient.getQueryCache().getAll()) {
            if (
                query.state.status === 'error' &&
                queryBelongsToProject(query.queryKey, activeProjectUuid)
            )
                notify(query.state.error);
        }
        const onQueryFailed = (event: Event) => {
            if (
                event instanceof CustomEvent &&
                event.detail?.projectUuid === activeProjectUuid
            )
                notify(event.detail.error);
        };
        window.addEventListener(SHARED_SIGN_IN_QUERY_FAILED, onQueryFailed);
        return () => {
            clearTrailingCheck();
            unsubscribeQueries();
            unsubscribeMutations();
            window.removeEventListener(
                SHARED_SIGN_IN_QUERY_FAILED,
                onQueryFailed,
            );
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
                lastChecks.current.delete(modalProjectUuid);
                openProjects.current.delete(modalProjectUuid);
                dismissedProjects.current.delete(modalProjectUuid);
            }}
            onClose={() => {
                clearSharedSignInToastSuppression(modalProjectUuid);
                dismissedProjects.current.add(modalProjectUuid);
                openProjects.current.delete(modalProjectUuid);
                setModalProjectUuid(null);
            }}
        />
    ) : null;
};
