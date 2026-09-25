import { type SqlRunnerWarehouseConnection } from '@lightdash/common';

const lastUsedStorageKey = (projectUuid: string) =>
    `lightdash.sqlRunner.lastConnection.${projectUuid}`;

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
    warehouseConnectionUuid: string,
): void => {
    try {
        window.localStorage.setItem(
            lastUsedStorageKey(projectUuid),
            warehouseConnectionUuid,
        );
    } catch {
        return;
    }
};

export const forgetLastUsedConnection = (
    projectUuid: string,
    warehouseConnectionUuid: string,
): void => {
    try {
        if (readLastUsedConnection(projectUuid) !== warehouseConnectionUuid) {
            return;
        }
        window.localStorage.removeItem(lastUsedStorageKey(projectUuid));
    } catch {
        return;
    }
};

type ErrorLike = {
    name?: string;
    message?: string;
    error?: { name?: string; message?: string };
};

export const isMissingConnectionError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const { error: detail, ...rest } = error as ErrorLike;
    return /connection not found/i.test(
        (detail ?? (rest as ErrorLike)).message ?? '',
    );
};

export const resolveActiveConnection = ({
    connections,
    lastUsedConnectionUuid,
}: {
    connections: SqlRunnerWarehouseConnection[];
    lastUsedConnectionUuid: string | undefined;
}): string | undefined => {
    if (connections.length === 1) {
        return connections[0].warehouseConnectionUuid;
    }
    return connections.some(
        (connection) =>
            connection.warehouseConnectionUuid === lastUsedConnectionUuid,
    )
        ? lastUsedConnectionUuid
        : undefined;
};

const GENERATED_SELECT =
    /^SELECT \* FROM [`"[\]\w.]+(?: ?\r?\nWHERE [^\r\n]+ -- This table has a (?:date|range) partition on this field)?$/i;

export const isReplaceableSql = (sql: string): boolean => {
    const trimmed = sql.trim();
    return trimmed === '' || GENERATED_SELECT.test(trimmed);
};

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
