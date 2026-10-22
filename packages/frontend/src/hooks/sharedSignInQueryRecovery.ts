import {
    getWarehouseSignInErrorType,
    isApiError,
    isBigqueryTokenErrorMessage,
    type ApiErrorDetail,
    type PersonalSignInExpiry,
} from '@lightdash/common';
import {
    type Query,
    type QueryClient,
    type QueryKey,
    useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useId, useLayoutEffect } from 'react';
import {
    getActiveWarehouseSignInPreflight,
    useWarehouseSignInPreflightStore,
    warehouseSignInBindingKey,
    type WarehouseSignInBinding,
    type WarehouseSignInExecutionIdentity,
    type WarehouseSignInPreflight,
    type WarehouseSignInTarget,
} from '../components/NavBar/warehouseSignInPreflight';

type QueryScope = WarehouseSignInExecutionIdentity & {
    recoveryGeneration: number;
    personalSignIn: PersonalSignInExpiry | null;
    query?: Query;
    request?: number;
};
export type SharedSignInRestoration = {
    target: WarehouseSignInTarget;
    recoveryGeneration: number;
};
type Root = {
    query: Query;
    binding: WarehouseSignInBinding;
    selectionGeneration: number;
};
type Replay = {
    watermark: number;
    generation: number;
    binding: WarehouseSignInBinding;
    selectionGeneration: number;
};
const pages = new WeakMap<
    WarehouseSignInPreflight,
    {
        roots: Map<string, Root>;
        polls: Map<string, QueryScope>;
        replays: Map<Query, Replay>;
        receipt: SharedSignInRestoration | null;
        publishedGeneration: number;
    }
>();
const requests = new WeakMap<Query, QueryScope>();
const failures = new WeakMap<ApiErrorDetail, QueryScope>();
export const rememberSharedSignInFailure = (
    error: ApiErrorDetail,
    scope: QueryScope | null,
) => {
    if (scope) failures.set(error, scope);
};
export const getSharedSignInFailureScope = (error: ApiErrorDetail) =>
    failures.get(error) ?? null;
const starts = new WeakMap<Query, number>();
const pageState = (store: WarehouseSignInPreflight) => {
    let state = pages.get(store);
    if (!state) {
        state = {
            roots: new Map(),
            polls: new Map(),
            replays: new Map(),
            receipt: null,
            publishedGeneration: 0,
        };
        pages.set(store, state);
    }
    return state;
};
export const captureSharedSignInQueryScope = (
    projectUuid: string,
    binding?: WarehouseSignInBinding,
): QueryScope | null => {
    const store = getActiveWarehouseSignInPreflight();
    if (
        !store ||
        store.loading ||
        store.identity.projectUuid !== projectUuid ||
        binding === undefined
    )
        return null;
    const check = store.checks.get(warehouseSignInBindingKey(binding));
    return check && store.hasPreferredBinding(binding)
        ? {
              ...store.identity,
              binding,
              generation: check.generation,
              recoveryGeneration: store.recoveryGeneration,
              personalSignIn: check.status?.personalSignIn ?? null,
          }
        : null;
};
const canReplaySharedSignInQueryScope = (scope: QueryScope | null) => {
    const store = getActiveWarehouseSignInPreflight();
    return (
        !!scope &&
        !!store &&
        store.isCurrent(scope) &&
        store.hasPreferredBinding(scope.binding)
    );
};
export const isCurrentSharedSignInQueryScope = (scope: QueryScope | null) =>
    canReplaySharedSignInQueryScope(scope) &&
    scope!.recoveryGeneration ===
        getActiveWarehouseSignInPreflight()!.recoveryGeneration &&
    (!scope!.query ||
        (requests.get(scope!.query) === scope &&
            [
                ...pageState(
                    getActiveWarehouseSignInPreflight()!,
                ).roots.values(),
            ].some(
                (root) =>
                    root.query === scope!.query &&
                    root.binding === scope!.binding,
            )));
export const beginSharedSignInQuery = (
    client: QueryClient,
    key: QueryKey,
    projectUuid: string,
    binding: WarehouseSignInBinding | undefined,
) => {
    const scope = captureSharedSignInQueryScope(projectUuid, binding);
    const query = client.getQueryCache().find(key, { exact: true });
    if (!scope || !query) return scope;
    scope.query = query;
    scope.request = (starts.get(query) ?? 0) + 1;
    starts.set(query, scope.request);
    requests.set(query, scope);
    return scope;
};
export const rememberSharedSignInQuery = (
    scope: QueryScope | null,
    queryUuid: string,
) => {
    const store = getActiveWarehouseSignInPreflight();
    if (store && isCurrentSharedSignInQueryScope(scope)) {
        const state = pageState(store);
        state.polls.set(queryUuid, scope!);
        const limit = state.roots.size + 100;
        for (const [key, origin] of state.polls) {
            if (state.polls.size <= limit) break;
            if (!isCurrentSharedSignInQueryScope(origin))
                state.polls.delete(key);
        }
    }
};
export const getSharedSignInPollScope = (
    projectUuid: string,
    queryUuid: string,
) => {
    const store = getActiveWarehouseSignInPreflight();
    return store?.identity.projectUuid === projectUuid
        ? (pageState(store).polls.get(queryUuid) ?? null)
        : null;
};
export const getSharedSignInQueryScope = (query: Query) =>
    requests.get(query) ?? null;
export const trackSharedSignInPoll = (
    client: QueryClient,
    key: QueryKey,
    scope: QueryScope | null,
) => {
    const query = client.getQueryCache().find(key, { exact: true });
    if (scope && query) requests.set(query, scope);
};
export const isWarehouseSignInQueryErrorDetail = (
    error: Pick<ApiErrorDetail, 'name' | 'statusCode' | 'data' | 'message'>,
): boolean =>
    (error.statusCode === 400 || error.statusCode === 401) &&
    [
        'BigqueryTokenError',
        'SnowflakeTokenError',
        'DatabricksTokenError',
        'WarehouseSignInExpiredError',
    ].includes(error.name) &&
    (!!error.data?.personalSignIn ||
        !!error.data?.sharedSignIn ||
        getWarehouseSignInErrorType(error.message)?.name === error.name ||
        (error.name === 'BigqueryTokenError' &&
            isBigqueryTokenErrorMessage(error.message)));
export const isWarehouseSignInQueryError = (error: unknown): boolean =>
    isApiError(error) &&
    !!error.error &&
    isWarehouseSignInQueryErrorDetail(error.error);
export const isAcceptedSharedSignInRestoration = (
    detail: unknown,
): detail is SharedSignInRestoration => {
    const store = getActiveWarehouseSignInPreflight();
    return (
        !!detail &&
        typeof detail === 'object' &&
        !!store &&
        pageState(store).receipt === detail &&
        store.isCurrent((detail as SharedSignInRestoration).target) &&
        store.hasPreferredBinding(
            (detail as SharedSignInRestoration).target.binding,
        ) &&
        store.recoveryGeneration ===
            (detail as SharedSignInRestoration).recoveryGeneration
    );
};
export const activateSharedSignInRestoration = (detail: unknown) => {
    if (!isAcceptedSharedSignInRestoration(detail)) return;
    const store = getActiveWarehouseSignInPreflight();
    if (!store) return;
    const state = pageState(store);
    if (state.publishedGeneration === detail.recoveryGeneration) return;
    state.publishedGeneration = detail.recoveryGeneration;
    store.notify();
};
export const canReplayRestoredSql = (
    scope: QueryScope | null,
    detail: unknown,
) =>
    isAcceptedSharedSignInRestoration(detail) &&
    canReplaySharedSignInQueryScope(scope) &&
    scope!.binding === detail.target.binding &&
    scope!.generation === detail.target.generation &&
    scope!.recoveryGeneration + 1 === detail.recoveryGeneration &&
    (!scope!.personalSignIn ||
        scope!.personalSignIn.userWarehouseCredentialsUuid ===
            detail.target.status.personalSignIn?.userWarehouseCredentialsUuid);
export const completeSharedSignInRestoration = async (
    client: QueryClient,
    target: WarehouseSignInTarget,
    attemptCurrent = () => true,
) => {
    const store = getActiveWarehouseSignInPreflight();
    if (
        !attemptCurrent() ||
        !store ||
        store.target !== target ||
        !store.isCurrent(target) ||
        !store.hasPreferredBinding(target.binding)
    )
        return null;
    const state = pageState(store);
    if (state.receipt?.target === target) return null;
    const receipt = {
        target,
        recoveryGeneration: store.recoveryGeneration + 1,
    };
    state.receipt = receipt;
    const abandon = () => {
        if (state.receipt === receipt) state.receipt = null;
        for (const [query, replay] of state.replays)
            if (replay.generation === receipt.recoveryGeneration)
                state.replays.delete(query);
        return null;
    };
    const candidates = new Map(
        [...state.roots.values()].map((root) => [root.query, root]),
    );
    const roots = new Set(candidates.keys());
    const watermarks = new Map(
        [...roots].map((query) => [query, starts.get(query) ?? 0]),
    );
    store.recoveryGeneration += 1;
    store.checks.get(
        warehouseSignInBindingKey(target.binding),
    )!.requestVersion += 1;

    await client.cancelQueries({
        predicate: (query) => {
            const origin = requests.get(query)?.query;
            return (
                roots.has(query) ||
                (!!origin && roots.has(origin)) ||
                (query.queryKey[0] === 'shared-sign-in-status' &&
                    query.queryKey[1] === target.projectUuid &&
                    query.queryKey[2] === target.userUuid &&
                    query.queryKey[3] ===
                        warehouseSignInBindingKey(target.binding))
            );
        },
    });
    if (
        !attemptCurrent() ||
        getActiveWarehouseSignInPreflight() !== store ||
        store.target !== target ||
        !store.isCurrent(target) ||
        !store.hasPreferredBinding(target.binding)
    )
        return abandon();
    const current = new Set(
        [...state.roots.values()].map((root) => root.query),
    );
    for (const [query, root] of candidates)
        if (current.has(query))
            state.replays.set(query, {
                binding: root.binding,
                selectionGeneration: root.selectionGeneration,
                watermark: watermarks.get(query) ?? 0,
                generation: receipt.recoveryGeneration,
            });
    await client.invalidateQueries({
        predicate: (query) => state.replays.has(query),
        refetchType: 'none',
    });
    if (
        !attemptCurrent() ||
        getActiveWarehouseSignInPreflight() !== store ||
        store.target !== target ||
        !store.isCurrent(target)
    )
        return abandon();
    client.removeQueries({
        queryKey: [
            'shared-sign-in-status',
            target.projectUuid,
            target.userUuid,
            warehouseSignInBindingKey(target.binding),
        ],
    });
    store.restored(target);
    store.recoveryGeneration = receipt.recoveryGeneration;
    return receipt;
};
export const useSharedSignInQueryRecovery = ({
    queryKey,
    projectUuid,
    binding,
    candidate,
    ready,
    refetch,
}: {
    queryKey: QueryKey;
    projectUuid: string | undefined;
    binding: WarehouseSignInBinding | undefined;
    candidate: boolean;
    ready: boolean;
    refetch: (options: { cancelRefetch: boolean }) => Promise<unknown>;
}) => {
    const store = useWarehouseSignInPreflightStore();
    const client = useQueryClient();
    const source = useId();
    const query = client.getQueryCache().find(queryKey, { exact: true });
    const revision = store?.snapshot();
    const selectionGeneration =
        binding === undefined
            ? undefined
            : store?.checks.get(warehouseSignInBindingKey(binding))?.generation;
    const preferred =
        binding !== undefined && (!store || store.hasPreferredBinding(binding));
    useLayoutEffect(() => {
        if (
            !store ||
            store.loading ||
            !candidate ||
            !preferred ||
            selectionGeneration === undefined ||
            !query ||
            binding === undefined ||
            projectUuid !== store.identity.projectUuid
        )
            return;
        const state = pageState(store);
        state.roots.set(source, { query, binding, selectionGeneration });
        return () => {
            state.roots.delete(source);
            if (
                ![...state.roots.values()].some((root) => root.query === query)
            ) {
                state.replays.delete(query);
            }
        };
    }, [
        store,
        source,
        candidate,
        query,
        projectUuid,
        binding,
        selectionGeneration,
        preferred,
    ]);
    useEffect(() => {
        if (
            !store ||
            !query ||
            !candidate ||
            !ready ||
            binding === undefined ||
            !store.ready(binding) ||
            !store.hasPreferredBinding(binding)
        )
            return;
        const state = pageState(store);
        if (state.publishedGeneration !== store.recoveryGeneration) return;
        const replay = state.replays.get(query);
        if (!replay || replay.generation !== store.recoveryGeneration) return;
        if (
            replay.binding !== binding ||
            replay.selectionGeneration !== selectionGeneration
        ) {
            state.replays.delete(query);
            return;
        }
        state.replays.delete(query);
        if ((starts.get(query) ?? 0) <= replay.watermark)
            void refetch({ cancelRefetch: false });
    }, [
        store,
        revision,
        query,
        candidate,
        ready,
        binding,
        refetch,
        selectionGeneration,
    ]);
};
