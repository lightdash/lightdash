import {
    getExpiredSharedSignInMessage,
    SignInSubjectBasis,
    type ApiError,
    type SharedSignInStatus,
} from '@lightdash/common';
import { IconPlugConnected } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import {
    captureSharedSignInQueryScope,
    clearSharedSignInQueryScope,
    isCurrentSharedSignInQuery,
    isWarehouseSignInQueryError,
    replaySharedSignInQueries,
    startSharedSignInQueryScope,
    trackSharedSignInQuery,
} from '../../hooks/sharedSignInQueryRecovery';
import {
    clearSharedSignInToastSuppression,
    setSharedSignInToastSuppression,
} from '../../hooks/toaster/sharedSignInToastSuppression';
import useToaster from '../../hooks/toaster/useToaster';
import {
    getSharedSignInStatus,
    SHARED_SIGN_IN_QUERY_FAILED,
    SHARED_SIGN_IN_RECONNECTED,
} from '../../hooks/useReconnectSharedSignIn';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    getSharedSignInExpiry,
    shouldOpenSharedSignInReconnectModal,
} from '../ProjectConnection/SharedSignIn/sharedSignInCopy';
import {
    queryBelongsToProject,
    scheduleSharedSignInCooldownCheck,
    shouldCheckSharedSignInStatus,
} from './sharedSignInListenerDecision';
import {
    setWarehouseSignInPreflight,
    setWarehouseSignInBanner,
} from './warehouseSignInBannerState';

export const useSharedSignInStatusListener = ({
    activeProjectUuid,
    userUuid,
    isQueryPage,
    reconnectEnabled,
    expiryEnabled,
    flagsLoading,
    currentProjectUuid,
    lastChecks,
    pendingProjects,
    openProjects,
    dismissedProjects,
}: {
    activeProjectUuid: string | undefined;
    userUuid: string;
    isQueryPage: boolean;
    reconnectEnabled: boolean | undefined;
    expiryEnabled: boolean | undefined;
    flagsLoading: boolean;
    currentProjectUuid: RefObject<string | undefined>;
    lastChecks: RefObject<Map<string, number>>;
    pendingProjects: RefObject<Set<string>>;
    openProjects: RefObject<Set<string>>;
    dismissedProjects: RefObject<Set<string>>;
}) => {
    const [statuses, setStatuses] = useState<
        Record<string, SharedSignInStatus>
    >({});
    const statusesRef = useRef(statuses);
    const version = useRef(0);
    const [modalProjectUuid, setModalProjectUuid] = useState<string | null>(
        null,
    );
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastWarning } = useToaster();
    useEffect(() => {
        if (!activeProjectUuid || !isQueryPage) return;
        let cancelled = false;
        startSharedSignInQueryScope(activeProjectUuid, userUuid);
        if (
            lastChecks.current.has(activeProjectUuid) &&
            !pendingProjects.current.has(activeProjectUuid) &&
            !openProjects.current.has(activeProjectUuid)
        )
            setWarehouseSignInPreflight(activeProjectUuid, userUuid);
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
            if (flagsLoading) return;
            if (error && !isWarehouseSignInQueryError(error)) return;
            if (!reconnectEnabled) {
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
                    trailingCheck = scheduleSharedSignInCooldownCheck(
                        lastCheck,
                        () => notify(error),
                    );
                }
                return;
            }
            clearTrailingCheck();
            if (!joiningPending)
                lastChecks.current.set(activeProjectUuid, Date.now());
            pendingProjects.current.add(activeProjectUuid);
            const projectUuid = activeProjectUuid;
            const requestVersion = version.current;
            const startedAt = lastChecks.current.get(projectUuid) ?? Date.now();
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
                    if (cancelled) {
                        if (requestVersion === version.current)
                            lastChecks.current.delete(projectUuid);
                        return;
                    }
                    if (
                        requestVersion !== version.current ||
                        projectUuid !== currentProjectUuid.current
                    )
                        return;
                    lastChecks.current.set(projectUuid, startedAt);
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
                    if (cancelled && requestVersion === version.current)
                        lastChecks.current.delete(projectUuid);
                    if (
                        !cancelled &&
                        requestVersion === version.current &&
                        projectUuid === currentProjectUuid.current
                    ) {
                        lastChecks.current.set(projectUuid, startedAt);
                        setWarehouseSignInPreflight(projectUuid, userUuid);
                        showExpiryToast(error);
                    }
                });
        };
        const unsubscribeQueries = queryClient
            .getQueryCache()
            .subscribe((event) => {
                if (event.type === 'updated' && event.action.type === 'fetch')
                    trackSharedSignInQuery(event.query);
                if (
                    event.type === 'updated' &&
                    event.action.type === 'error' &&
                    isCurrentSharedSignInQuery(event.query) &&
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
                if (event.type === 'updated' && event.action.type === 'loading')
                    trackSharedSignInQuery(event.mutation);
                if (
                    event.type === 'updated' &&
                    event.action.type === 'error' &&
                    isCurrentSharedSignInQuery(event.mutation) &&
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
                isCurrentSharedSignInQuery(query) &&
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
            replaySharedSignInQueries(queryClient, (query) =>
                queryBelongsToProject(query.queryKey, activeProjectUuid),
            );
            version.current += 1;
            void queryClient.cancelQueries({
                queryKey: [
                    'shared-sign-in-status',
                    activeProjectUuid,
                    userUuid,
                ],
            });
            pendingProjects.current.delete(activeProjectUuid);
            clearTrailingCheck();
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
        if (expiryEnabled) notify(undefined, true);
        return () => {
            cancelled = true;
            const currentScope =
                captureSharedSignInQueryScope(activeProjectUuid);
            if (currentScope?.userUuid === userUuid)
                clearSharedSignInQueryScope(currentScope);
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
        reconnectEnabled,
        flagsLoading,
        lightdashApi,
        isQueryPage,
        expiryEnabled,
        currentProjectUuid,
        lastChecks,
        pendingProjects,
        openProjects,
        dismissedProjects,
    ]);
    return { statuses, modalProjectUuid, setModalProjectUuid };
};
