import { type Connection } from '@lightdash/common';

const lastUsedStorageKey = (projectUuid: string) =>
    `lightdash.sqlRunner.lastConnection.${projectUuid}`;

// A per-viewer convenience: a blocked or cleared store must never break the page
export const readLastUsedConnection = (
    projectUuid: string,
): string | undefined => {
    try {
        return (
            window.localStorage.getItem(lastUsedStorageKey(projectUuid)) ??
            undefined
        );
    } catch {
        return undefined;
    }
};

export const writeLastUsedConnection = (
    projectUuid: string,
    connectionUuid: string,
): void => {
    try {
        window.localStorage.setItem(
            lastUsedStorageKey(projectUuid),
            connectionUuid,
        );
    } catch {
        // A viewer with storage blocked simply gets no last-used memory
    }
};

export const forgetLastUsedConnection = (
    projectUuid: string,
    connectionUuid: string,
): void => {
    try {
        if (readLastUsedConnection(projectUuid) !== connectionUuid) return;
        window.localStorage.removeItem(lastUsedStorageKey(projectUuid));
    } catch {
        // A viewer with storage blocked simply gets no last-used memory
    }
};

type ErrorLike = {
    name?: string;
    message?: string;
    error?: { name?: string; message?: string };
};

/**
 * True when a run or catalog call failed because the connection it named is
 * gone. The backend answers a removed connection with a not-found error, so
 * the message is the only signal the frontend gets.
 */
export const isMissingConnectionError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const { error: detail, ...rest } = error as ErrorLike;
    return /connection not found/i.test(
        (detail ?? (rest as ErrorLike)).message ?? '',
    );
};

/**
 * A saved chart opens on the connection stored with its version. A new
 * document opens on the last connection used in this project. A project with
 * one connection needs no choice at all. With several connections and nothing
 * to go on, nothing is selected: the runner waits for the picker rather than
 * guessing the first connection and querying the wrong warehouse.
 */
export const resolveActiveConnection = ({
    connections,
    savedConnectionUuid,
    lastUsedConnectionUuid,
    isSavedChart,
}: {
    connections: Connection[];
    savedConnectionUuid: string | undefined;
    lastUsedConnectionUuid: string | undefined;
    isSavedChart: boolean;
}): string | undefined => {
    const [firstConnection] = connections;
    if (!firstConnection) return undefined;

    const isKnown = (connectionUuid: string | undefined) =>
        connectionUuid !== undefined &&
        connections.some(
            (connection) => connection.connectionUuid === connectionUuid,
        );

    const soleConnection =
        connections.length === 1 ? firstConnection.connectionUuid : undefined;

    if (isSavedChart) {
        return isKnown(savedConnectionUuid)
            ? savedConnectionUuid
            : soleConnection;
    }
    return isKnown(lastUsedConnectionUuid)
        ? lastUsedConnectionUuid
        : soleConnection;
};

// The editor content a table click may replace: nothing, or a select this
// runner generated. The generated form carries an optional partition filter.
const GENERATED_SELECT = /^SELECT \* FROM [`"[\]\w.]+\s*(\r?\nWHERE .*)?$/is;

export const isReplaceableSql = (sql: string): boolean => {
    const trimmed = sql.trim();
    return trimmed === '' || GENERATED_SELECT.test(trimmed);
};

/**
 * What a table click does. One rule decides whether the editor may be
 * replaced, on this connection or another: only an empty editor or a select
 * this runner generated. SQL the user wrote is never overwritten in silence.
 */
export type TableClickOutcome =
    | 'insert'
    | 'select-only'
    | 'switch-and-insert'
    | 'prompt';

export const tableClickOutcome = ({
    sql,
    activeConnectionUuid,
    tableConnectionUuid,
}: {
    sql: string;
    activeConnectionUuid: string | undefined;
    tableConnectionUuid: string;
}): TableClickOutcome => {
    const isReplaceable = isReplaceableSql(sql);
    if (
        activeConnectionUuid === undefined ||
        tableConnectionUuid === activeConnectionUuid
    ) {
        return isReplaceable ? 'insert' : 'select-only';
    }
    return isReplaceable ? 'switch-and-insert' : 'prompt';
};

/**
 * Whether the editor should give way to "choose a connection". Typed SQL is
 * never covered by it: a connection removed under the user must not look like
 * their work is gone.
 */
export const shouldAskForConnection = (
    connection: {
        hasSeveralConnections: boolean;
        isConnectionSettled: boolean;
    },
    sql: string,
): boolean =>
    connection.hasSeveralConnections &&
    !connection.isConnectionSettled &&
    sql === '';
