import { useMemo } from 'react';
import { useLocation } from 'react-router';

/**
 * Agent settings can be opened from the agent chat page, the admin agents
 * table, or a thread sidebar. The opener records where it came from so that
 * saving or cancelling returns there instead of a hardcoded destination.
 */
export type AgentSettingsLocationState = {
    returnTo: string;
};

// Only same-origin relative paths are honoured; anything else falls back.
const isSafeReturnTo = (value: string): boolean =>
    value.startsWith('/') && !value.startsWith('//');

const readReturnTo = (state: unknown): string | null => {
    if (typeof state !== 'object' || state === null) {
        return null;
    }
    const { returnTo } = state as Partial<AgentSettingsLocationState>;
    if (typeof returnTo !== 'string' || !isSafeReturnTo(returnTo)) {
        return null;
    }
    return returnTo;
};

export const resolveReturnTo = (state: unknown, fallback: string): string =>
    readReturnTo(state) ?? fallback;

/**
 * Builds the location state to attach when linking into agent settings, so the
 * settings page knows where to send the user back to.
 */
export const useAgentSettingsLinkState = (): AgentSettingsLocationState => {
    const { pathname, search } = useLocation();
    return useMemo(
        () => ({ returnTo: `${pathname}${search}` }),
        [pathname, search],
    );
};
