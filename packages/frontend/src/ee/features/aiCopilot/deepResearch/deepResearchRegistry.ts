import { useSyncExternalStore } from 'react';
import { type DeepResearchRunRegistration } from './types';

const STORAGE_KEY = 'lightdash.deep-research-runs.v1';
const REGISTRY_EVENT = 'lightdash:deep-research-runs-changed';

const readRegistry = (): DeepResearchRunRegistration[] => {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        const value: unknown = JSON.parse(
            window.localStorage.getItem(STORAGE_KEY) ?? '[]',
        );
        return Array.isArray(value)
            ? value.filter(
                  (item): item is DeepResearchRunRegistration =>
                      typeof item === 'object' &&
                      item !== null &&
                      'runUuid' in item &&
                      typeof item.runUuid === 'string' &&
                      'userUuid' in item &&
                      typeof item.userUuid === 'string' &&
                      'threadUuid' in item &&
                      typeof item.threadUuid === 'string',
              )
            : [];
    } catch {
        return [];
    }
};

let snapshot = readRegistry();
const EMPTY_REGISTRY: DeepResearchRunRegistration[] = [];

const emitChange = (registrations: DeepResearchRunRegistration[]) => {
    snapshot = registrations;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registrations));
    window.dispatchEvent(new Event(REGISTRY_EVENT));
};

export const registerDeepResearchRun = (
    registration: DeepResearchRunRegistration,
) => {
    const registrations = readRegistry().filter(
        (item) => item.runUuid !== registration.runUuid,
    );
    emitChange([...registrations, registration]);
};

export const replaceDeepResearchRun = (
    previousRunUuid: string,
    registration: DeepResearchRunRegistration,
) => {
    const registrations = readRegistry().filter(
        (item) => item.runUuid !== previousRunUuid,
    );
    emitChange([...registrations, registration]);
};

export const updateDeepResearchRun = (
    runUuid: string,
    updates: Partial<DeepResearchRunRegistration>,
) => {
    emitChange(
        readRegistry().map((registration) =>
            registration.runUuid === runUuid
                ? { ...registration, ...updates }
                : registration,
        ),
    );
};

const subscribe = (onStoreChange: () => void) => {
    const handleChange = () => {
        snapshot = readRegistry();
        onStoreChange();
    };
    window.addEventListener(REGISTRY_EVENT, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
        window.removeEventListener(REGISTRY_EVENT, handleChange);
        window.removeEventListener('storage', handleChange);
    };
};

export const useDeepResearchRunsForThread = (
    projectUuid: string,
    threadUuid: string,
    userUuid: string | undefined,
) => {
    const registrations = useSyncExternalStore(
        subscribe,
        () => snapshot,
        () => EMPTY_REGISTRY,
    );
    return registrations.filter(
        (registration) =>
            registration.projectUuid === projectUuid &&
            registration.threadUuid === threadUuid &&
            registration.userUuid === userUuid,
    );
};

const COMPOSER_EVENT = 'lightdash:deep-research-composer-prompt';

export const subscribeToDeepResearchComposerPrompt = (
    listener: (detail: { threadUuid: string; prompt: string }) => void,
) => {
    const handleEvent = (event: Event) => {
        const detail = (
            event as CustomEvent<{
                threadUuid: string;
                prompt: string;
            }>
        ).detail;
        if (detail) listener(detail);
    };
    window.addEventListener(COMPOSER_EVENT, handleEvent);
    return () => window.removeEventListener(COMPOSER_EVENT, handleEvent);
};
