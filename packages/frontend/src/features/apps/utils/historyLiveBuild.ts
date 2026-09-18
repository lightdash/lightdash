import { type ChatMessage } from './chatMessage';

/** A build whose version has not reached history yet. */
export type AppVersionHistoryLiveBuild = {
    claimedVersion: number | null;
    pendingPrompt: string | null;
};

/**
 * The prompt in flight before the server has claimed a version for it, so
 * history shows it on top; null once the building version is in the list.
 */
export const getHistoryLiveBuild = (
    localMessages: ChatMessage[],
    isAwaitingVersion: boolean,
): AppVersionHistoryLiveBuild | null => {
    if (!isAwaitingVersion) return null;
    const pending = [...localMessages]
        .reverse()
        .find((message) => message.role === 'user');
    return { claimedVersion: null, pendingPrompt: pending?.content ?? null };
};
