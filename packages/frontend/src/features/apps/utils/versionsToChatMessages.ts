import {
    type ApiAppVersionSummary,
    type AppVersionStatusHistoryEntry,
    type AppVersionStatusHistoryEntryKind,
} from '@lightdash/common';
import { getAppVersionFailureMessage } from '../getAppVersionFailureMessage';
import {
    emptyChatMessage,
    type ChatAttachedFile,
    type ChatChart,
    type ChatConnection,
    type ChatMessage,
} from './chatMessage';

// The null guard exists because the poll worker feeds raw fetch JSON into
// the query cache; the consecutive dedupe because a retry can restart the
// generation stream and re-emit the same entry.
export function versionNarrationTexts(
    history: AppVersionStatusHistoryEntry[] | undefined,
    kind: AppVersionStatusHistoryEntryKind,
): string[] {
    return (history ?? [])
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.message)
        .filter((message, index, all) => message !== all[index - 1]);
}

/**
 * Session-only attachment fallbacks, keyed by prompt text. Versions persisted
 * before server-side resource capture carry no `resources`, so a surface that
 * submitted the prompt itself can supply what it sent. Surfaces that only read
 * history omit them.
 */
export type ChatMessageFallbacks = {
    charts: Map<string, ChatChart[]>;
    connections: Map<string, ChatConnection[]>;
    imagePreviewUrls: Map<string, string[]>;
    files: Map<string, ChatAttachedFile[]>;
    dashboardName: Map<string, string>;
};

// Read-only, so one shared instance serves every caller that has none.
const NO_FALLBACKS: ChatMessageFallbacks = {
    charts: new Map(),
    connections: new Map(),
    imagePreviewUrls: new Map(),
    files: new Map(),
    dashboardName: new Map(),
};

/** Display name of whoever asked for a version; null when unknown. */
export const getVersionAuthorName = (
    version: ApiAppVersionSummary,
): string | null => {
    if (!version.createdByUser) return null;
    return (
        [version.createdByUser.firstName, version.createdByUser.lastName]
            .filter((s) => s.length > 0)
            .join(' ') || null
    );
};

/**
 * Convert fetched app versions into chat messages, oldest first. Each version
 * yields a user bubble (the prompt) plus, once terminal, an assistant bubble
 * carrying the outcome. Versions still building yield only the user bubble —
 * their progress is rendered live by the caller.
 */
export function versionsToChatMessages(
    versions: ApiAppVersionSummary[],
    fallbacks: ChatMessageFallbacks = NO_FALLBACKS,
): ChatMessage[] {
    if (versions.length === 0) return [];
    const sorted = [...versions].sort((a, b) => a.version - b.version);

    return sorted.flatMap((v) => {
        // Prefer server-side resources; fall back to session maps.
        const serverCharts: ChatChart[] =
            v.resources?.charts.map((c) => ({
                name: c.chartName,
                uuid: c.chartUuid,
                chartKind: undefined,
                linkLive: c.linkLive,
            })) ?? [];
        const charts =
            serverCharts.length > 0
                ? serverCharts
                : (fallbacks.charts.get(v.prompt) ?? []);

        const serverConnections: ChatConnection[] =
            v.resources?.externalConnections?.map((c) => ({
                externalConnectionUuid: c.externalConnectionUuid,
                name: c.name,
                alias: c.alias,
            })) ?? [];
        const externalConnections =
            serverConnections.length > 0
                ? serverConnections
                : (fallbacks.connections.get(v.prompt) ?? []);

        const imageResourceIds =
            v.resources?.images.map((img) => img.imageId) ?? [];
        const imagePreviewUrls = fallbacks.imagePreviewUrls.get(v.prompt) ?? [];
        const files: ChatAttachedFile[] =
            v.resources?.files?.map((f) => ({ filename: f.filename })) ??
            fallbacks.files.get(v.prompt) ??
            [];
        const dashboardName =
            v.resources?.dashboardName ??
            fallbacks.dashboardName.get(v.prompt) ??
            null;
        const clarifications = v.resources?.clarifications ?? [];

        // Assistant reply is dated to when the build actually finished; fall
        // back to createdAt for old rows persisted before the column started
        // being written, or for rows still mid-build.
        const replyTimestamp = v.statusUpdatedAt ?? v.createdAt;
        // Uploaded-from-source versions (`lightdash upload`) are the only ones
        // created without a prompt. Their build pipeline stores no completion
        // message either, so derive the assistant bubble from the version row
        // rather than trusting a leftover statusMessage.
        const isUploadedVersion = v.prompt === '';
        const readyMessage =
            v.version === 1
                ? 'Your app is ready!'
                : `Version ${v.version} is ready!`;
        // Null rather than 0 when the version never recorded a transition:
        // an unknown duration is not a zero-second build.
        const durationMs = v.statusUpdatedAt
            ? new Date(v.statusUpdatedAt).getTime() -
              new Date(v.createdAt).getTime()
            : null;
        const reasoning = versionNarrationTexts(v.statusHistory, 'thinking');
        const activity = versionNarrationTexts(v.statusHistory, 'tool');

        const msgs: ChatMessage[] = [
            {
                ...emptyChatMessage(),
                role: 'user',
                content: v.prompt,
                imagePreviewUrls,
                imageResourceIds,
                files,
                charts,
                externalConnections,
                dashboardName,
                clarifications,
                timestamp: new Date(v.createdAt),
                userName: getVersionAuthorName(v),
            },
        ];

        if (v.status === 'ready') {
            msgs.push({
                ...emptyChatMessage(),
                role: 'assistant',
                status: 'ready',
                durationMs,
                content: isUploadedVersion
                    ? readyMessage
                    : (v.statusMessage ?? readyMessage),
                version: v.version,
                timestamp: new Date(replyTimestamp),
                vizSchema: v.resources?.vizSchema ?? null,
                reasoning,
                activity,
            });
        } else if (v.status === 'error') {
            msgs.push({
                ...emptyChatMessage(),
                role: 'assistant',
                status: 'error',
                durationMs,
                content: getAppVersionFailureMessage(v),
                // `version` stays null: a deps chip renders off it, and a
                // failed build has no artifacts to describe.
                timestamp: new Date(replyTimestamp),
                reasoning,
                activity,
            });
        }
        // 'building' status yields no assistant bubble — the caller renders it
        // as a live progress indicator instead.
        return msgs;
    });
}
