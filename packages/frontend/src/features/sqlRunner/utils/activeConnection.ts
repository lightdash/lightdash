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

/**
 * A saved chart opens on the connection stored with its version. A new
 * document opens on the last connection used in this project. Either way an
 * unknown connection falls back to the project's first one, so a removed or
 * renamed connection never leaves the runner pointing at nothing.
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

    if (isSavedChart) {
        return isKnown(savedConnectionUuid)
            ? savedConnectionUuid
            : firstConnection.connectionUuid;
    }
    return isKnown(lastUsedConnectionUuid)
        ? lastUsedConnectionUuid
        : firstConnection.connectionUuid;
};

// The editor content a table click may replace: nothing, or a select this
// runner generated. The generated form carries an optional partition filter.
const GENERATED_SELECT = /^SELECT \* FROM [`"[\]\w.]+\s*(\r?\nWHERE .*)?$/is;

export const isReplaceableSql = (sql: string): boolean => {
    const trimmed = sql.trim();
    return trimmed === '' || GENERATED_SELECT.test(trimmed);
};

/**
 * What a table click does. A table on the active connection behaves as it
 * always has. A table on another connection replaces an empty or generated
 * editor outright, and otherwise asks before discarding what the user wrote.
 */
export type TableClickOutcome = 'insert' | 'switch-and-insert' | 'prompt';

export const tableClickOutcome = ({
    sql,
    activeConnectionUuid,
    tableConnectionUuid,
}: {
    sql: string;
    activeConnectionUuid: string | undefined;
    tableConnectionUuid: string;
}): TableClickOutcome => {
    if (
        activeConnectionUuid === undefined ||
        tableConnectionUuid === activeConnectionUuid
    ) {
        return 'insert';
    }
    return isReplaceableSql(sql) ? 'switch-and-insert' : 'prompt';
};
