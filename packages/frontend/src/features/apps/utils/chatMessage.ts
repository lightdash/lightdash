import { type AppClarification } from '@lightdash/common';
import { type ChartKind } from '@lightdash/common';
import { type DataAppVizSchema } from '@lightdash/common';

export type ChatChart = {
    name: string;
    uuid: string;
    chartKind?: ChartKind;
    /** True when the chart was attached as a live link (run by uuid). */
    linkLive?: boolean;
};

export type ChatConnection = {
    externalConnectionUuid: string;
    name: string;
    alias: string;
};

/** A non-image attachment on a user bubble, rendered as a filename chip. */
export type ChatAttachedFile = {
    filename: string;
};

export type ChatMessage = {
    role: 'user' | 'assistant';
    /**
     * Outcome of an assistant bubble; `null` on user bubbles. The only signal
     * renderers use to tell success from failure.
     */
    status: 'ready' | 'error' | null;
    content: string;
    imagePreviewUrls: string[];
    imageResourceIds: string[];
    files: ChatAttachedFile[];
    charts: ChatChart[];
    externalConnections: ChatConnection[];
    dashboardName: string | null;
    clarifications: AppClarification[];
    version: number | null;
    timestamp: Date;
    userName: string | null;
    vizSchema: DataAppVizSchema | null;
    // Thinking snippets accumulated while the version generated; shown as a
    // collapsed Reasoning row on assistant bubbles. Empty for user bubbles
    // and versions predating reasoning capture.
    reasoning: string[];
    // Tool actions ("Creating App.tsx") from the same narration history;
    // shown as a collapsed Activity row on assistant bubbles.
    activity: string[];
    // For optimistic (local) user bubbles only. Records the latest server
    // version number known at submit time. The bubble is dropped from the
    // merged view once the server has produced a higher version — that's the
    // signal the server has acknowledged the prompt and it now lives in
    // `history` as a v_n bubble. Resubmitting the same prompt later still
    // shows the optimistic bubble because the new `submittedAtVersion` is the
    // current latest, so the comparison hasn't tripped yet.
    submittedAtVersion?: number;
};

/**
 * Every field a message can carry, at its "nothing here" value, so a literal
 * only has to state what it actually has. A function rather than a constant so
 * no two messages share an array.
 */
export const emptyChatMessage = (): Omit<
    ChatMessage,
    'role' | 'timestamp'
> => ({
    status: null,
    content: '',
    imagePreviewUrls: [],
    imageResourceIds: [],
    files: [],
    charts: [],
    externalConnections: [],
    dashboardName: null,
    clarifications: [],
    version: null,
    userName: null,
    vizSchema: null,
    reasoning: [],
    activity: [],
});

/**
 * Merge server-side history with the optimistic local message queue, dropping
 * any optimistic user bubble whose corresponding server version has already
 * landed in history. Tested in `mergeChatMessages.test.ts`.
 */
export function mergeChatMessages(
    history: ChatMessage[],
    local: ChatMessage[],
    maxHistoryVersion: number,
): ChatMessage[] {
    const dedupedLocal = local.filter((msg) => {
        if (msg.submittedAtVersion === undefined) return true;
        return msg.submittedAtVersion >= maxHistoryVersion;
    });
    return [...history, ...dedupedLocal];
}
