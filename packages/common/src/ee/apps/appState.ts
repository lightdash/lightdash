/**
 * Durable key-value state for data apps. Values are JSON, stored by Lightdash,
 * read and written through the SDK bridge as the viewer.
 *
 * `user` scope: one value per app + user + key, overwritten in place.
 * `shared` scope: one value per app + key, visible to every viewer, with a
 * version per write and a history of every version.
 */

/** UTF-8 bytes of the serialized JSON value. */
export const APP_STATE_MAX_VALUE_BYTES = 64 * 1024;
export const APP_STATE_MAX_KEYS_PER_SCOPE = 200;
export const APP_STATE_MAX_HISTORY_VERSIONS = 1000;
/** Per app, per viewer, per backend process. A loop guard, not a quota. */
export const APP_STATE_MAX_WRITES_PER_MINUTE = 600;
export const APP_STATE_HISTORY_DEFAULT_LIMIT = 50;
export const APP_STATE_HISTORY_MAX_LIMIT = 200;

const APP_STATE_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

export const isValidAppStateKey = (key: string): boolean =>
    APP_STATE_KEY_PATTERN.test(key);

export type AppStateScope = 'user' | 'shared';

export type AppStateAuthor = {
    userUuid: string;
    name: string | null;
};

export type AppStateUserEntry = {
    value: unknown;
    updatedAt: string;
};

export type AppStateSharedEntry = {
    value: unknown;
    version: number;
    updatedAt: string;
    updatedBy: AppStateAuthor | null;
};

export type AppStateHistoryAuthor =
    | { kind: 'user'; userUuid: string | null; name: string | null }
    | { kind: 'agent' };

export type AppStateHistoryEntry = {
    version: number;
    value: unknown;
    createdAt: string;
    author: AppStateHistoryAuthor;
};

/** Everything the viewer can read for one app, fetched once on app load. */
export type AppStateSnapshot = {
    user: Record<string, AppStateUserEntry>;
    shared: Record<string, AppStateSharedEntry>;
};

export type SetAppUserStateRequest = {
    value: unknown;
};

export type SetAppSharedStateRequest = {
    value: unknown;
    /** Version the writer last read; `null` means "create, fail if it exists". */
    expectedVersion: number | null;
};

export type AppStateHistory = {
    versions: AppStateHistoryEntry[];
};

/** Payload of a 409 on a shared write: what the key holds now. */
export type AppStateConflictData = {
    current: AppStateSharedEntry | null;
};

export type ApiAppStateSnapshotResponse = {
    status: 'ok';
    results: AppStateSnapshot;
};

export type ApiAppUserStateResponse = {
    status: 'ok';
    results: AppStateUserEntry;
};

export type ApiAppSharedStateResponse = {
    status: 'ok';
    results: AppStateSharedEntry;
};

export type ApiAppStateHistoryResponse = {
    status: 'ok';
    results: AppStateHistory;
};

/**
 * Serialized size of a JSON value, or null when the value is not JSON
 * (undefined, functions, symbols, or anything that serializes to nothing).
 */
export const appStateValueByteLength = (value: unknown): number | null => {
    if (value === undefined) return null;
    let serialized: string | undefined;
    try {
        serialized = JSON.stringify(value);
    } catch {
        return null;
    }
    if (typeof serialized !== 'string') return null;
    return new TextEncoder().encode(serialized).length;
};
