import { type ApiError, type LearnProgress } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../api';

/**
 * What the learner has done with walkthroughs, kept on the instance per
 * user (CS-186): the ones finished (Got it on the last step), the ones
 * started, and the last one started (the library's Resume card). The same
 * account sees the same progress from any browser.
 */
const LEARN_PROGRESS_QUERY_KEY = ['learn_progress'] as const;

const EMPTY: LearnProgress = { completed: [], started: [], lastStarted: null };

const getProgress = () =>
    lightdashApi<LearnProgress>({
        url: '/user/learn-progress',
        method: 'GET',
        body: undefined,
    });

const postStarted = (scope: string) =>
    lightdashApi<LearnProgress>({
        url: `/user/learn-progress/${encodeURIComponent(scope)}/started`,
        method: 'POST',
        body: undefined,
    });

const postCompleted = (scope: string) =>
    lightdashApi<LearnProgress>({
        url: `/user/learn-progress/${encodeURIComponent(scope)}/completed`,
        method: 'POST',
        body: undefined,
    });

const postMerge = (progress: LearnProgress) =>
    lightdashApi<LearnProgress>({
        url: '/user/learn-progress/merge',
        method: 'POST',
        body: JSON.stringify(progress),
    });

/**
 * Where progress lived before the instance kept it. Read once, sent to the
 * instance, and removed, so nothing a learner did before the change is
 * lost; a browser that never had any is left alone.
 */
const LEGACY_KEYS = {
    completed: 'lightdash.learn.completed',
    started: 'lightdash.learn.started',
    lastStarted: 'lightdash.learn.lastStarted',
} as const;

const readLegacyList = (key: string): string[] => {
    try {
        const raw = localStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.filter((x): x is string => typeof x === 'string')
            : [];
    } catch {
        return [];
    }
};

const readLegacyProgress = (): LearnProgress | null => {
    const completed = readLegacyList(LEGACY_KEYS.completed);
    const started = readLegacyList(LEGACY_KEYS.started);
    let lastStarted: string | null = null;
    try {
        lastStarted = localStorage.getItem(LEGACY_KEYS.lastStarted);
    } catch {
        // storage unavailable: nothing to bring across
    }
    if (completed.length === 0 && started.length === 0 && !lastStarted) {
        return null;
    }
    return { completed, started, lastStarted };
};

const clearLegacyProgress = () => {
    try {
        Object.values(LEGACY_KEYS).forEach((key) =>
            localStorage.removeItem(key),
        );
    } catch {
        // storage unavailable: there was nothing to clear
    }
};

/**
 * The instance's answer, after any browser-held progress has been taken
 * in. The keys are only removed once the instance has it; if the merge
 * fails the browser keeps them and the next read tries again.
 */
const fetchProgress = async (): Promise<LearnProgress> => {
    const legacy = readLegacyProgress();
    if (!legacy) return getProgress();
    const merged = await postMerge(legacy);
    clearLegacyProgress();
    return merged;
};

const union = (list: string[], scope: string) =>
    list.includes(scope) ? list : [...list, scope];

/** Newer progress folded into the cache: nothing done is ever undone. */
const fold = (
    queryClient: QueryClient,
    update: (previous: LearnProgress) => LearnProgress,
) =>
    queryClient.setQueryData<LearnProgress>(
        LEARN_PROGRESS_QUERY_KEY,
        (previous) => update(previous ?? EMPTY),
    );

const foldServer = (queryClient: QueryClient, server: LearnProgress) =>
    fold(queryClient, (previous) => ({
        completed: server.completed.reduce(union, previous.completed),
        started: server.started.reduce(union, previous.started),
        // A start made here and not yet acknowledged is newer than what
        // the instance answered with.
        lastStarted: previous.lastStarted ?? server.lastStarted,
    }));

export type LearnProgressState = LearnProgress & {
    /** The instance has answered; until then the lists are empty. */
    isSettled: boolean;
};

export const useLearnProgress = (): LearnProgressState => {
    const query = useQuery<LearnProgress, ApiError>({
        queryKey: LEARN_PROGRESS_QUERY_KEY,
        queryFn: fetchProgress,
        // Progress only changes through the actions below, which keep the
        // cache right; a tab that comes back into focus asks again.
        staleTime: 60 * 1000,
    });
    return useMemo(
        () => ({ ...(query.data ?? EMPTY), isSettled: !query.isLoading }),
        [query.data, query.isLoading],
    );
};

/**
 * Record a start or a completion. The cache is updated first, so the
 * library and the completion page show it at once, and the instance's
 * answer is folded in when it arrives. If the instance refuses, the cache
 * is refetched so the page shows what is actually held.
 */
export const useLearnProgressActions = () => {
    const queryClient = useQueryClient();
    const settle = useCallback(
        () => queryClient.cancelQueries(LEARN_PROGRESS_QUERY_KEY),
        [queryClient],
    );
    const onError = useCallback(
        () => queryClient.invalidateQueries(LEARN_PROGRESS_QUERY_KEY),
        [queryClient],
    );
    const onSuccess = useCallback(
        (server: LearnProgress) => foldServer(queryClient, server),
        [queryClient],
    );
    const started = useMutation<LearnProgress, ApiError, string>(postStarted, {
        onMutate: async (scope) => {
            await settle();
            fold(queryClient, (previous) => ({
                ...previous,
                started: union(previous.started, scope),
                lastStarted: scope,
            }));
        },
        onSuccess,
        onError,
    });
    const completed = useMutation<LearnProgress, ApiError, string>(
        postCompleted,
        {
            onMutate: async (scope) => {
                await settle();
                fold(queryClient, (previous) => ({
                    ...previous,
                    started: union(previous.started, scope),
                    completed: union(previous.completed, scope),
                }));
            },
            onSuccess,
            onError,
        },
    );
    const markScopeStarted = started.mutate;
    const markScopeCompleted = completed.mutate;
    return useMemo(
        () => ({ markScopeStarted, markScopeCompleted }),
        [markScopeStarted, markScopeCompleted],
    );
};
