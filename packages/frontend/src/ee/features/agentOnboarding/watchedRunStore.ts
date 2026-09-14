import { useSyncExternalStore } from 'react';

export type WatchedAgentOnboardingRun = {
    agentOnboardingRunUuid: string;
    projectUuid: string;
};

const STORAGE_KEY = 'lightdash.agentOnboarding.watchedRun';

const isWatchedRun = (value: unknown): value is WatchedAgentOnboardingRun =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WatchedAgentOnboardingRun).agentOnboardingRunUuid ===
        'string' &&
    typeof (value as WatchedAgentOnboardingRun).projectUuid === 'string';

const readFromStorage = (): WatchedAgentOnboardingRun | null => {
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (!stored) return null;
        const parsed: unknown = JSON.parse(stored);
        return isWatchedRun(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

let watchedRun: WatchedAgentOnboardingRun | null = readFromStorage();

const subscribers = new Set<() => void>();

const emit = () => {
    subscribers.forEach((subscriber) => subscriber());
};

export const setWatchedAgentOnboardingRun = (
    run: WatchedAgentOnboardingRun,
) => {
    if (
        watchedRun?.agentOnboardingRunUuid === run.agentOnboardingRunUuid &&
        watchedRun?.projectUuid === run.projectUuid
    ) {
        return;
    }
    watchedRun = run;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    } catch {
        // storage is best-effort — the in-memory value still drives the watcher
    }
    emit();
};

export const clearWatchedAgentOnboardingRun = () => {
    if (watchedRun === null) return;
    watchedRun = null;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // storage is best-effort — the in-memory value still drives the watcher
    }
    emit();
};

// ts-unused-exports:disable-next-line
export const subscribeToWatchedAgentOnboardingRun = (
    onStoreChange: () => void,
) => {
    subscribers.add(onStoreChange);
    return () => {
        subscribers.delete(onStoreChange);
    };
};

// ts-unused-exports:disable-next-line
export const getWatchedAgentOnboardingRunSnapshot = () => watchedRun;

export const useWatchedAgentOnboardingRun = () =>
    useSyncExternalStore(
        subscribeToWatchedAgentOnboardingRun,
        getWatchedAgentOnboardingRunSnapshot,
        getWatchedAgentOnboardingRunSnapshot,
    );
