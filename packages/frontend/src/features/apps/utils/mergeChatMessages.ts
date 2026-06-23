import { type AppClarification } from '@lightdash/common';
import { type ChartKind } from '@lightdash/common';

export type ChatChart = {
    name: string;
    uuid: string;
    chartKind?: ChartKind;
};

export type ChatConnection = {
    externalConnectionUuid: string;
    name: string;
    alias: string;
};

export type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    imagePreviewUrls: string[];
    imageResourceIds: string[];
    charts: ChatChart[];
    externalConnections: ChatConnection[];
    dashboardName: string | null;
    clarifications: AppClarification[];
    appUuid: string | null;
    version: number | null;
    timestamp: Date;
    userName: string | null;
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
