import { type Connection, type SummaryExplore } from '@lightdash/common';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const storageKey = (projectUuid: string) =>
    `lightdash:explore-connection-filter:v1:${projectUuid}`;

const browserStorage = (): StorageLike | undefined =>
    typeof window === 'undefined' ? undefined : window.localStorage;

export const readConnectionFilter = (
    projectUuid: string | undefined,
    connectionUuids: string[],
    storage: StorageLike | undefined = browserStorage(),
): string | null => {
    if (!projectUuid) {
        return null;
    }

    try {
        const connectionUuid = storage?.getItem(storageKey(projectUuid));
        return connectionUuid && connectionUuids.includes(connectionUuid)
            ? connectionUuid
            : null;
    } catch {
        return null;
    }
};

export const writeConnectionFilter = (
    projectUuid: string | undefined,
    connectionUuid: string | null,
    storage: StorageLike | undefined = browserStorage(),
): void => {
    if (!projectUuid) {
        return;
    }

    try {
        if (connectionUuid) {
            storage?.setItem(storageKey(projectUuid), connectionUuid);
        } else {
            storage?.removeItem(storageKey(projectUuid));
        }
    } catch {
        return;
    }
};

/**
 * The name to put on an empty panel: a connection filter that matches nothing.
 * A connection with no dbt source can never contribute a table, and the panel
 * would otherwise go blank with nothing to read.
 */
export const emptyFilteredConnectionName = (
    connections: Connection[],
    connectionFilter: string | null,
    filteredExplores: SummaryExplore[] | undefined,
): string | undefined => {
    if (connectionFilter === null) return undefined;
    if (filteredExplores === undefined) return undefined;
    if (filteredExplores.length > 0) return undefined;
    return connections.find(
        ({ connectionUuid }) => connectionUuid === connectionFilter,
    )?.name;
};
