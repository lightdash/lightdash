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
    if (!projectUuid) return null;
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
    if (!projectUuid) return;
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
