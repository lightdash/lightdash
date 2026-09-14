import { useSyncExternalStore } from 'react';
import { type DeepResearchRunRegistration } from './types';

const STORAGE_KEY = 'lightdash.deep-research-runs.v1';
const REGISTRY_EVENT = 'lightdash:deep-research-runs-changed';
let memoryRegistry: DeepResearchRunRegistration[] = [];
let storageAvailable = true;

const readRegistry = (): DeepResearchRunRegistration[] => {
    if (typeof window === 'undefined') {
        return [];
    }
    if (!storageAvailable) {
        return memoryRegistry;
    }
    try {
        const value: unknown = JSON.parse(
            window.localStorage.getItem(STORAGE_KEY) ?? '[]',
        );
        const registrations = Array.isArray(value)
            ? value.filter(
                  (item): item is DeepResearchRunRegistration =>
                      typeof item === 'object' &&
                      item !== null &&
                      'runUuid' in item &&
                      typeof item.runUuid === 'string' &&
                      'agentUuid' in item &&
                      typeof item.agentUuid === 'string' &&
                      'userUuid' in item &&
                      typeof item.userUuid === 'string' &&
                      'threadUuid' in item &&
                      typeof item.threadUuid === 'string' &&
                      'promptUuid' in item &&
                      typeof item.promptUuid === 'string' &&
                      'question' in item &&
                      typeof item.question === 'string',
              )
            : [];
        memoryRegistry = registrations;
        return registrations;
    } catch {
        return memoryRegistry;
    }
};

let snapshot = readRegistry();
const EMPTY_REGISTRY: DeepResearchRunRegistration[] = [];

const emitChange = (registrations: DeepResearchRunRegistration[]) => {
    memoryRegistry = registrations;
    snapshot = registrations;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registrations));
        storageAvailable = true;
    } catch {
        storageAvailable = false;
        // The in-memory registry keeps Deep Research usable when storage is
        // blocked or full. It intentionally lasts only for this page session.
    }
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
        (item) =>
            item.runUuid !== previousRunUuid &&
            item.promptUuid !== registration.promptUuid,
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

export const findRetryableDeepResearchRun = ({
    projectUuid,
    agentUuid,
    threadUuid,
    userUuid,
    question,
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    userUuid: string | undefined;
    question: string;
}): DeepResearchRunRegistration | undefined =>
    readRegistry()
        .filter(
            (registration) =>
                registration.projectUuid === projectUuid &&
                registration.agentUuid === agentUuid &&
                registration.threadUuid === threadUuid &&
                registration.userUuid === userUuid &&
                registration.question === question &&
                registration.state === 'start_failed',
        )
        .sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt),
        )[0];

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

export const restoreDeepResearchComposerPrompt = (
    threadUuid: string,
    prompt: string,
) => {
    window.dispatchEvent(
        new CustomEvent(COMPOSER_EVENT, {
            detail: { threadUuid, prompt },
        }),
    );
};

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
