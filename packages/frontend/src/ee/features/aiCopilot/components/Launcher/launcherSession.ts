const URL_KEY = 'aiAgentsLauncher:lastNonAgentUrl';
const EXPANDED_KEY = 'aiAgentsLauncher:expandedFromBubble';

const safeGet = (key: string): string | null => {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSet = (key: string, value: string): void => {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // sessionStorage may be disabled — best-effort
    }
};

const safeRemove = (key: string): void => {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // best-effort
    }
};

export const launcherSession = {
    rememberLastNonAgentUrl: (url: string) => safeSet(URL_KEY, url),
    consumeLastNonAgentUrl: (): string | null => safeGet(URL_KEY),

    markExpandedFromBubble: () => safeSet(EXPANDED_KEY, 'true'),
    clearExpandedFromBubble: () => safeRemove(EXPANDED_KEY),
    isExpandedFromBubble: (): boolean => safeGet(EXPANDED_KEY) === 'true',
};
