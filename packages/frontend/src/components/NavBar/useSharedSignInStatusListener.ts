import {
    getExpiredSharedSignInMessage,
    getWarehouseSignInErrorType,
    isBigqueryTokenErrorMessage,
    SignInSubjectBasis,
    type ApiError,
} from '@lightdash/common';
import { IconPlugConnected } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
    activateSharedSignInRestoration,
    getSharedSignInQueryScope,
    isCurrentSharedSignInQueryScope,
    isWarehouseSignInQueryError,
    type SharedSignInRestoration,
} from '../../hooks/sharedSignInQueryRecovery';
import { type captureSharedSignInQueryScope } from '../../hooks/sharedSignInQueryRecovery';
import useToaster from '../../hooks/toaster/useToaster';
import {
    getSharedSignInStatus,
    SHARED_SIGN_IN_QUERY_FAILED,
    SHARED_SIGN_IN_RECONNECTED,
} from '../../hooks/useReconnectSharedSignIn';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { getSharedSignInExpiry } from '../ProjectConnection/SharedSignIn/sharedSignInCopy';
import {
    queryBelongsToProject,
    scheduleSharedSignInCooldownCheck,
} from './sharedSignInListenerDecision';
import {
    acceptWarehouseSignInStatus,
    useWarehouseSignInPreflightStore,
    warehouseSignInBindingKey,
} from './warehouseSignInPreflight';

export const useSharedSignInStatusListener = ({
    reconnectEnabled,
    flagsLoading,
}: {
    reconnectEnabled: boolean | undefined;
    flagsLoading: boolean;
}) => {
    const store = useWarehouseSignInPreflightStore();
    const revision = store?.snapshot();
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastWarning } = useToaster();
    const lastSharedChecks = useRef(new Map<string, number>());
    useEffect(() => {
        if (!store || !store.enabled || store.loading) return;
        for (const check of store.checks.values()) {
            if (check.started) continue;
            check.started = true;
            const { binding, generation, requestVersion } = check;
            void queryClient
                .fetchQuery({
                    queryKey: [
                        'shared-sign-in-status',
                        store.identity.projectUuid,
                        store.identity.userUuid,
                        warehouseSignInBindingKey(binding),
                        store.identity.pageGeneration,
                        generation,
                    ],
                    queryFn: () =>
                        store.statusCache.fetch(
                            store.identity,
                            binding,
                            generation,
                            () =>
                                getSharedSignInStatus(
                                    lightdashApi,
                                    store.identity.projectUuid,
                                    binding,
                                ),
                            check.forceRefresh,
                        ),
                    retry: false,
                    staleTime: 0,
                    cacheTime: 0,
                })
                .then((status) => {
                    if (check.requestVersion !== requestVersion) return;
                    const accepted =
                        status?.personalSignIn &&
                        status.personalSignIn.projectUuid !==
                            store.identity.projectUuid
                            ? null
                            : acceptWarehouseSignInStatus(status, binding);
                    if (!store.settle(binding, generation, accepted))
                        store.statusCache.abandon(
                            store.identity,
                            binding,
                            generation,
                        );
                })
                .catch(() => {
                    if (check.requestVersion !== requestVersion) return;
                    if (!store.settle(binding, generation, null))
                        store.statusCache.abandon(
                            store.identity,
                            binding,
                            generation,
                        );
                });
        }
    }, [store, revision, queryClient, lightdashApi]);

    useEffect(() => {
        if (!store || flagsLoading) return;
        let cancelled = false;
        let trailingCheck: ReturnType<typeof setTimeout> | null = null;
        const clearTrailingCheck = () => {
            if (trailingCheck !== null) clearTimeout(trailingCheck);
            trailingCheck = null;
        };
        const scheduleCheck = (error: unknown, checkedAt: number) => {
            clearTrailingCheck();
            trailingCheck = scheduleSharedSignInCooldownCheck(checkedAt, () =>
                notify(error),
            );
        };
        const pendingPersonal = new Set<string>();
        const notify = (
            error: unknown,
            execution: ReturnType<typeof captureSharedSignInQueryScope> = null,
        ) => {
            if (execution && !isCurrentSharedSignInQueryScope(execution))
                return;
            const detail = (error as Partial<ApiError> | null)?.error;
            const controlled =
                detail && typeof detail.message === 'string'
                    ? getWarehouseSignInErrorType(detail.message)
                    : null;
            if (
                detail &&
                (detail.data?.personalSignIn ||
                    controlled?.scope === 'personal')
            ) {
                if (
                    !store.enabled ||
                    !execution ||
                    !isCurrentSharedSignInQueryScope(execution) ||
                    !isWarehouseSignInQueryError(error)
                )
                    return;
                const { binding, generation } = execution;
                const key = warehouseSignInBindingKey(binding);
                const check = store.checks.get(key);
                if (!check || pendingPersonal.has(key) || store.target) return;
                pendingPersonal.add(key);
                const version = ++check.requestVersion;
                void getSharedSignInStatus(
                    lightdashApi,
                    store.identity.projectUuid,
                    binding,
                )
                    .then((status) => {
                        if (
                            cancelled ||
                            !isCurrentSharedSignInQueryScope(execution) ||
                            check.requestVersion !== version
                        )
                            return;
                        const accepted = acceptWarehouseSignInStatus(
                            status,
                            binding,
                        );
                        const selected = accepted?.personalSignIn;
                        const failure =
                            detail.data?.personalSignIn ??
                            execution.personalSignIn;
                        if (
                            !selected ||
                            selected.projectUuid !== execution.projectUuid ||
                            (failure &&
                                (failure.userWarehouseCredentialsUuid !==
                                    selected.userWarehouseCredentialsUuid ||
                                    failure.provider !== selected.provider)) ||
                            (controlled?.provider &&
                                selected.provider !== controlled.provider)
                        )
                            return;
                        if (
                            accepted.statusUnknown ||
                            (!failure && !selected.expired)
                        )
                            return;
                        store.settle(binding, generation, {
                            ...accepted,
                            personalSignIn: { ...selected, expired: true },
                        });
                    })
                    .catch(() => {})
                    .finally(() => pendingPersonal.delete(key));
                return;
            }
            if (execution && execution.binding !== null) return;
            const apiError = (error as Partial<ApiError> | null)?.error;
            const expiry = apiError && getSharedSignInExpiry(apiError);
            if (!apiError || apiError.data?.personalSignIn) return;
            const rawTokenFailure =
                apiError.name === 'BigqueryTokenError' &&
                (apiError.statusCode === 400 || apiError.statusCode === 401) &&
                typeof apiError.message === 'string' &&
                isBigqueryTokenErrorMessage(apiError.message);
            if (
                expiry
                    ? expiry.projectUuid !== store.identity.projectUuid
                    : !(
                          rawTokenFailure ||
                          (controlled?.scope === 'shared' &&
                              execution?.binding === null)
                      )
            )
                return;
            if (!reconnectEnabled) {
                if (!expiry) return;
                const isSubject =
                    expiry.subjectUserUuid === store.identity.userUuid &&
                    (expiry.subjectBasis === SignInSubjectBasis.RECORDED ||
                        expiry.subjectBasis ===
                            SignInSubjectBasis.PROJECT_CREATOR);
                showToastWarning({
                    key: 'shared-sign-in-expired',
                    projectUuid: expiry.projectUuid,
                    title: getExpiredSharedSignInMessage(
                        expiry,
                        store.identity.userUuid,
                    ),
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
                return;
            }
            if (
                !store.checks.has(warehouseSignInBindingKey(null)) ||
                !store.hasPreferredBinding(null) ||
                store.target
            )
                return;
            const projectUuid = store.identity.projectUuid;
            const sharedKey = JSON.stringify([
                projectUuid,
                store.identity.userUuid,
            ]);
            const last = lastSharedChecks.current.get(sharedKey) ?? -Infinity;
            if (Date.now() - last < 60_000) {
                scheduleCheck(error, last);
                return;
            }
            clearTrailingCheck();
            const cachedAt = store.statusCache.checkedAt(store.identity, null);
            lastSharedChecks.current.set(
                sharedKey,
                cachedAt !== undefined && Date.now() - cachedAt < 60_000
                    ? cachedAt
                    : Date.now(),
            );
            const release = store.register('shared-error', null, 0);
            const check = store.checks.get(warehouseSignInBindingKey(null))!;
            const generation = check.generation;
            const requestVersion = check.requestVersion;
            void store.statusCache
                .fetch(store.identity, null, generation, () =>
                    getSharedSignInStatus(lightdashApi, projectUuid, null),
                )
                .then((status) => {
                    if (cancelled || check.requestVersion !== requestVersion)
                        return;
                    const accepted = status?.personalSignIn
                        ? null
                        : acceptWarehouseSignInStatus(status, null, true);
                    if (!store.settle(null, generation, accepted)) return;
                    if (
                        cachedAt !== undefined &&
                        Date.now() - cachedAt < 60_000 &&
                        !status?.personalSignIn &&
                        !accepted?.expired
                    )
                        scheduleCheck(error, cachedAt);
                })
                .catch(() => {
                    if (!cancelled && check.requestVersion === requestVersion)
                        store.settle(null, generation, null);
                })
                .finally(release);
        };
        const unsubscribeQueries = queryClient
            .getQueryCache()
            .subscribe((event) => {
                if (
                    event.type === 'updated' &&
                    event.action.type === 'error' &&
                    event.query.state.error &&
                    event.query.queryKey[0] !== 'shared-sign-in-status' &&
                    queryBelongsToProject(
                        event.query.queryKey,
                        store.identity.projectUuid,
                    )
                )
                    notify(
                        event.query.state.error,
                        getSharedSignInQueryScope(event.query),
                    );
            });
        const unsubscribeMutations = queryClient
            .getMutationCache()
            .subscribe((event) => {
                if (
                    event.type === 'updated' &&
                    event.mutation.state.error &&
                    queryBelongsToProject(
                        event.mutation.options.mutationKey,
                        store.identity.projectUuid,
                    )
                )
                    notify(event.mutation.state.error);
            });
        for (const query of queryClient.getQueryCache().getAll()) {
            if (
                query.state.status === 'error' &&
                query.queryKey[0] !== 'shared-sign-in-status' &&
                queryBelongsToProject(
                    query.queryKey,
                    store.identity.projectUuid,
                )
            )
                notify(query.state.error);
        }
        const onQueryFailed = (event: Event) => {
            if (
                event instanceof CustomEvent &&
                event.detail?.projectUuid === store.identity.projectUuid
            )
                notify(event.detail.error, event.detail.execution);
        };
        const onRestored = (event: Event) => {
            if (event instanceof CustomEvent)
                activateSharedSignInRestoration(event.detail);
            if (
                event instanceof CustomEvent &&
                (event.detail as SharedSignInRestoration)?.target
                    ?.pageGeneration === store.identity.pageGeneration
            ) {
                clearTrailingCheck();
                lastSharedChecks.current.delete(
                    JSON.stringify([
                        store.identity.projectUuid,
                        store.identity.userUuid,
                    ]),
                );
            }
        };
        window.addEventListener(SHARED_SIGN_IN_RECONNECTED, onRestored);
        window.addEventListener(SHARED_SIGN_IN_QUERY_FAILED, onQueryFailed);
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
        store,
        flagsLoading,
        reconnectEnabled,
        lightdashApi,
        queryClient,
        showToastWarning,
        navigate,
    ]);
    return store;
};
