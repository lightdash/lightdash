import {
    APP_VERSION_CANCELLED_BY_USER,
    assertUnreachable,
    getAppDisplayName,
    isAppVersionInProgress,
    type AiAgentMessageUser,
    type AiPromptContextItem,
    type ApiAppVersionSummary,
    type ApiGetAppResponse,
    type ToolGenerateDataAppOutput,
} from '@lightdash/common';
import { getAppVersionFailureMessage } from '../../../../../../features/apps/getAppVersionFailureMessage';
import { getVersionNarration } from '../../../../../../features/apps/utils/versionNarration';
import { type DataAppBuildCardState } from './DataAppBuildCard';

type AppData = ApiGetAppResponse['results'];

/** What the thread knows about the app the build belongs to. */
export type DataAppBuildCardAppSource =
    | { kind: 'loading' }
    | { kind: 'loaded'; app: AppData }
    // Deleted or no access (403/404).
    | { kind: 'unavailable' }
    // Any other fetch failure; treated as transient.
    | { kind: 'error' };

const getBuildDurationMs = (row: ApiAppVersionSummary): number | null =>
    row.statusUpdatedAt
        ? new Date(row.statusUpdatedAt).getTime() -
          new Date(row.createdAt).getTime()
        : null;

const getReadyState = ({
    appUuid,
    name,
    version,
    row,
}: {
    appUuid: string;
    name: string;
    version: number;
    row: ApiAppVersionSummary | undefined;
}): DataAppBuildCardState => ({
    kind: 'ready',
    name: getAppDisplayName(name, appUuid),
    version,
    durationMs: row ? getBuildDurationMs(row) : null,
    restoredFromVersion: null,
    completionMessage:
        row?.statusMessage ??
        (version === 1 ? 'Your app is ready!' : `Version ${version} is ready!`),
});

const getStateFromVersionRow = (
    metadata: Extract<
        ToolGenerateDataAppOutput['metadata'],
        { status: 'pending' }
    >,
    app: AppData,
): DataAppBuildCardState => {
    const row = app.versions.find((v) => v.version === metadata.version);
    if (!row || row.status === 'pending') {
        return { kind: 'queued' };
    }
    if (isAppVersionInProgress(row.status)) {
        return {
            kind: 'building',
            statusMessage: row.statusMessage ?? 'Building your app',
            narration: getVersionNarration(row.statusHistory),
        };
    }
    if (row.status === 'ready') {
        return getReadyState({
            appUuid: metadata.appUuid,
            name: app.name,
            version: metadata.version,
            row,
        });
    }
    if (row.error === APP_VERSION_CANCELLED_BY_USER) {
        return { kind: 'cancelled' };
    }
    return { kind: 'failed', message: getAppVersionFailureMessage(row) };
};

/**
 * Card state for a generateDataApp tool result. A pending result is read
 * from the app's live version; a terminal result stands on its own, with
 * the app only enriching the ready card. Null when there is nothing to show.
 */
export const getDataAppBuildCardState = (
    metadata: ToolGenerateDataAppOutput['metadata'],
    source: DataAppBuildCardAppSource,
): DataAppBuildCardState | null => {
    switch (metadata.status) {
        case 'error':
            if (metadata.appUuid === null) return null;
            if (source.kind === 'unavailable') return { kind: 'unavailable' };
            return metadata.reason === 'cancelled'
                ? { kind: 'cancelled' }
                : { kind: 'failed', message: metadata.message };
        case 'success': {
            if (source.kind === 'unavailable') return { kind: 'unavailable' };
            const row =
                source.kind === 'loaded'
                    ? source.app.versions.find(
                          (v) => v.version === metadata.version,
                      )
                    : undefined;
            return getReadyState({
                appUuid: metadata.appUuid,
                name: metadata.name,
                version: metadata.version,
                row,
            });
        }
        case 'pending':
            switch (source.kind) {
                case 'unavailable':
                    return { kind: 'unavailable' };
                case 'loaded':
                    return getStateFromVersionRow(metadata, source.app);
                case 'loading':
                case 'error':
                    return { kind: 'queued' };
                default:
                    return assertUnreachable(source, 'Unknown app source');
            }
        default:
            return assertUnreachable(metadata, 'Unknown build result');
    }
};

export type DataAppRestoreContextItem = Extract<
    AiPromptContextItem,
    { type: 'data_app_restore' }
>;

/** The restore a hidden user turn records, if that is what the turn is. */
export const getDataAppRestoreItem = (
    hiddenSibling: AiAgentMessageUser | null,
): DataAppRestoreContextItem | null =>
    hiddenSibling?.context.find(
        (item): item is DataAppRestoreContextItem =>
            item.type === 'data_app_restore',
    ) ?? null;

/** A thread restore already succeeded when its turn was written, so the card
 *  is ready unless the app has gone since. */
export const getDataAppRestoreCardState = (
    item: DataAppRestoreContextItem,
    response: string | null,
    source: DataAppBuildCardAppSource,
): DataAppBuildCardState => {
    if (source.kind === 'unavailable') return { kind: 'unavailable' };
    const name =
        item.displayName ??
        (source.kind === 'loaded'
            ? getAppDisplayName(source.app.name, item.appUuid)
            : 'Data app');
    return {
        kind: 'ready',
        name,
        version: item.version,
        durationMs: null,
        restoredFromVersion: item.restoredFromVersion,
        completionMessage:
            response ??
            `Restored version ${item.restoredFromVersion} as version ${item.version}.`,
    };
};

export const isDataAppBuildInProgress = (
    state: DataAppBuildCardState,
): boolean => state.kind === 'queued' || state.kind === 'building';
