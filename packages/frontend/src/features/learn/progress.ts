import {
    FeatureFlags,
    type ApiError,
    type LearnProgress,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { type LightdashApi } from '../../api';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { lessonScopesFor } from '../scopeTours/tourFor';

/**
 * What the learner has done with walkthroughs, kept on the instance per
 * user (CS-186): the ones finished (Got it on the last step), the ones
 * started, and the last one started (the library's Resume card). The same
 * account sees the same progress from any browser.
 */
const LEARN_PROGRESS_QUERY_KEY = ['learn_progress'] as const;

const EMPTY: LearnProgress = { completed: [], started: [], lastStarted: null };

const getProgress = (lightdashApi: LightdashApi) =>
    lightdashApi<LearnProgress>({
        url: '/user/learn-progress',
        method: 'GET',
        body: undefined,
    });

const postStarted = (lightdashApi: LightdashApi, scope: string) =>
    lightdashApi<LearnProgress>({
        url: `/user/learn-progress/${encodeURIComponent(scope)}/started`,
        method: 'POST',
        body: undefined,
    });

const postCompleted = (lightdashApi: LightdashApi, scope: string) =>
    lightdashApi<LearnProgress>({
        url: `/user/learn-progress/${encodeURIComponent(scope)}/completed`,
        method: 'POST',
        body: undefined,
    });

/**
 * Finishing a lesson records every scope it teaches (a lesson declared
 * with data-tour-covers stands for several), one after the other so the
 * instance folds each into the same record; its last answer has them all.
 */
const postLessonCompleted = (lightdashApi: LightdashApi, scope: string) =>
    lessonScopesFor(scope).reduce<Promise<LearnProgress>>(
        (previous, each) =>
            previous.then(() => postCompleted(lightdashApi, each)),
        Promise.resolve(EMPTY),
    );

const postMerge = (lightdashApi: LightdashApi, progress: LearnProgress) =>
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
const fetchProgress = async (
    lightdashApi: LightdashApi,
): Promise<LearnProgress> => {
    const legacy = readLegacyProgress();
    if (!legacy) return getProgress(lightdashApi);
    const merged = await postMerge(lightdashApi, legacy);
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
    const lightdashApi = useLightdashApi();
    // The tour host mounts on every project page, so progress is asked for
    // only where Learn exists at all: an organization with it switched off
    // never calls the endpoint. The navbar's Learn link already reads this
    // flag, so the gate costs no request of its own.
    const { data: learnFlag } = useServerFeatureFlag(FeatureFlags.EnableLearn);
    const enabled = learnFlag?.enabled === true;
    const query = useQuery<LearnProgress, ApiError>({
        queryKey: LEARN_PROGRESS_QUERY_KEY,
        queryFn: () => fetchProgress(lightdashApi),
        enabled,
        // Progress only changes through the actions below, which keep the
        // cache right; a tab that comes back into focus asks again.
        staleTime: 60 * 1000,
    });
    // Nothing to wait for where Learn is switched off; everywhere else the
    // instance has to have answered, one way or the other.
    const isSettled = !enabled || query.isSuccess || query.isError;
    return useMemo(
        () => ({ ...(query.data ?? EMPTY), isSettled }),
        [query.data, isSettled],
    );
};

/**
 * Record a start or a completion. The cache is updated first, so the
 * library and the completion page show it at once, and the instance's
 * answer is folded in when it arrives. If the instance refuses, the cache
 * is refetched so the page shows what is actually held.
 */
export const useLearnProgressActions = () => {
    const lightdashApi = useLightdashApi();
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
    const started = useMutation<LearnProgress, ApiError, string>(
        (scope: string) => postStarted(lightdashApi, scope),
        {
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
        },
    );
    const completed = useMutation<LearnProgress, ApiError, string>(
        (scope: string) => postLessonCompleted(lightdashApi, scope),
        {
            onMutate: async (scope) => {
                await settle();
                const scopes = lessonScopesFor(scope);
                fold(queryClient, (previous) => ({
                    ...previous,
                    started: scopes.reduce(union, previous.started),
                    completed: scopes.reduce(union, previous.completed),
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
