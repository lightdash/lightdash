import {
    getExpiredSharedSignInMessage,
    isBigqueryTokenErrorMessage,
    SignInSubjectBasis,
    type ApiError,
} from '@lightdash/common';
import { IconPlugConnected } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';
import {
    getSharedSignInStatus,
    SHARED_SIGN_IN_QUERY_FAILED,
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
            const { binding, generation } = check;
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
        const notify = (error: unknown) => {
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
                    : !rawTokenFailure
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
            void store.statusCache
                .fetch(store.identity, null, generation, () =>
                    getSharedSignInStatus(lightdashApi, projectUuid, null),
                )
                .then((status) => {
                    if (cancelled) return;
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
                    if (!cancelled) store.settle(null, generation, null);
                })
                .finally(release);
        };
        const unsubscribeQueries = queryClient
            .getQueryCache()
            .subscribe((event) => {
                if (
                    event.type === 'updated' &&
                    event.query.state.error &&
                    event.query.queryKey[0] !== 'shared-sign-in-status' &&
                    queryBelongsToProject(
                        event.query.queryKey,
                        store.identity.projectUuid,
                    )
                )
                    notify(event.query.state.error);
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
                notify(event.detail.error);
        };
        window.addEventListener(SHARED_SIGN_IN_QUERY_FAILED, onQueryFailed);
        return () => {
            cancelled = true;
            clearTrailingCheck();
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
