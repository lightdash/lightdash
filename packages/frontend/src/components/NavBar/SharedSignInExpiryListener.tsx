import {
    FeatureFlags,
    getExpiredSharedSignInMessage,
    SignInSubjectBasis,
    type ApiError,
    type SharedSignInStatus,
} from '@lightdash/common';
import { IconPlugConnected } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
    clearSharedSignInToastSuppression,
    setSharedSignInToastSuppression,
} from '../../hooks/toaster/sharedSignInToastSuppression';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import {
    getSharedSignInStatus,
    SHARED_SIGN_IN_QUERY_FAILED,
    SHARED_SIGN_IN_RECONNECTED,
} from '../../hooks/useReconnectSharedSignIn';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    getSharedSignInExpiry,
    shouldOpenSharedSignInReconnectModal,
} from '../ProjectConnection/SharedSignIn/sharedSignInCopy';
import { SharedSignInReconnectModal } from '../ProjectConnection/SharedSignIn/SharedSignInReconnectModal';
import {
    queryBelongsToProject,
    isWarehouseQueryPage,
    scheduleSharedSignInCooldownCheck,
    shouldCheckSharedSignInStatus,
} from './sharedSignInListenerDecision';
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastWarning } = useToaster();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { pathname } = useLocation();
    const isQueryPage = isWarehouseQueryPage(pathname);
    const expiryFlag = useServerFeatureFlag(
        FeatureFlags.SharedSignInExpiryMessage,
    );
    const bannerVisible = useWarehouseSignInBannerVisibility();
    const [statuses, setStatuses] = useState<
        Record<string, SharedSignInStatus>
    >({});
    const statusesRef = useRef(statuses);
    statusesRef.current = statuses;
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

    useEffect(
        () => () => {
            clearWarehouseSignInPreflight();
        },
        [],
    );

    useEffect(() => {
        currentProjectUuid.current = activeProjectUuid;
    }, [activeProjectUuid]);

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

    useEffect(() => {
        if (!activeProjectUuid || !isQueryPage) return;
        let cancelled = false;
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
        const notify = (error: unknown, joinPending = false) => {
            if (!activeProjectUuid) return;
            if (reconnectFlag.isLoading || expiryFlag.isLoading) return;
            if (!reconnectFlag.data?.enabled) {
                showExpiryToast(error);
                return;
            }
            const joiningPending =
                joinPending && pendingProjects.current.has(activeProjectUuid);
            if (
                !joiningPending &&
                !shouldCheckSharedSignInStatus({
                    projectUuid: activeProjectUuid,
                    pendingProjects: pendingProjects.current,
                    openProjects: openProjects.current,
                    dismissedProjects: new Set(),
                    lastChecks: lastChecks.current,
                    now: Date.now(),
                })
            ) {
                const lastCheck = lastChecks.current.get(activeProjectUuid);
                if (
                    lastCheck !== undefined &&
                    Date.now() - lastCheck < 60_000 &&
                    !openProjects.current.has(activeProjectUuid)
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
            if (!joiningPending)
                lastChecks.current.set(activeProjectUuid, Date.now());
            pendingProjects.current.add(activeProjectUuid);
            const projectUuid = activeProjectUuid;
            void queryClient
                .fetchQuery({
                    queryKey: ['shared-sign-in-status', projectUuid, userUuid],
                    queryFn: () =>
                        getSharedSignInStatus(lightdashApi, projectUuid),
                    staleTime: 0,
                    retry: false,
                })
                .then((status) => {
                    pendingProjects.current.delete(projectUuid);
                    if (cancelled || projectUuid !== currentProjectUuid.current)
                        return;
                    const expired =
                        status &&
                        (status.personalSignIn?.expired ?? status.expired);
                    if (status?.statusUnknown && !expired) {
                        setWarehouseSignInPreflight(projectUuid, userUuid);
                        return;
                    }
                    let opensModal = false;
                    if (status && expired) {
                        statusesRef.current = {
                            ...statusesRef.current,
                            [projectUuid]: status,
                        };
                        setStatuses(statusesRef.current);
                        setSharedSignInToastSuppression(
                            projectUuid,
                            status,
                            userUuid,
                        );
                        if (
                            shouldOpenSharedSignInReconnectModal(status) &&
                            !dismissedProjects.current.has(projectUuid)
                        ) {
                            opensModal = true;
                            openProjects.current.add(projectUuid);
                            setModalProjectUuid(projectUuid);
                        }
                    } else {
                        const { [projectUuid]: removed, ...remaining } =
                            statusesRef.current;
                        statusesRef.current = remaining;
                        setStatuses(remaining);
                        clearSharedSignInToastSuppression(projectUuid);
                        dismissedProjects.current.delete(projectUuid);
                        if (error) showExpiryToast(error);
                    }
                    if (!opensModal)
                        setWarehouseSignInPreflight(projectUuid, userUuid);
                })
                .catch(() => {
                    pendingProjects.current.delete(projectUuid);
                    if (
                        !cancelled &&
                        projectUuid === currentProjectUuid.current
                    ) {
                        setWarehouseSignInPreflight(projectUuid, userUuid);
                        showExpiryToast(error);
                    }
                });
        };
        const unsubscribeQueries = queryClient
            .getQueryCache()
            .subscribe((event) => {
                if (
                    event.type === 'updated' &&
                    event.query.queryKey[0] !== 'shared-sign-in-status' &&
                    !!event.query.state.error &&
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
        const onRestored = (event: Event) => {
            if (
                !(event instanceof CustomEvent) ||
                event.detail !== activeProjectUuid
            )
                return;
            lastChecks.current.delete(activeProjectUuid);
            dismissedProjects.current.delete(activeProjectUuid);
            openProjects.current.delete(activeProjectUuid);
            const { [activeProjectUuid]: removed, ...remaining } =
                statusesRef.current;
            statusesRef.current = remaining;
            setStatuses(remaining);
            setModalProjectUuid(null);
            setWarehouseSignInPreflight(activeProjectUuid, userUuid);
            clearSharedSignInToastSuppression(activeProjectUuid);
            setWarehouseSignInBanner(null);
        };
        window.addEventListener(SHARED_SIGN_IN_RECONNECTED, onRestored);
        window.addEventListener(SHARED_SIGN_IN_QUERY_FAILED, onQueryFailed);
        if (expiryFlag.data?.enabled) notify(undefined, true);
        return () => {
            cancelled = true;
            clearTrailingCheck();
            window.removeEventListener(SHARED_SIGN_IN_RECONNECTED, onRestored);
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
        lightdashApi,
        isQueryPage,
        expiryFlag.data?.enabled,
        expiryFlag.isLoading,
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
