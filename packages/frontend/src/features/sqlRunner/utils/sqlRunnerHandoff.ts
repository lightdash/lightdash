// Carries SQL into a SQL runner opened in a new tab, where router state does
// not reach. Entries are read once and kept out of the URL.

const KEY_PREFIX = 'sqlRunnerHandoff:';
const MAX_AGE_MS = 10 * 60 * 1000;

export const SQL_RUNNER_HANDOFF_PARAM = 'handoff';

export type SqlRunnerHandoff = {
    sql: string;
    // null binds the primary connection; absent leaves the runner's choice
    warehouseConnectionUuid?: string | null;
};

type StoredHandoff = SqlRunnerHandoff & { createdAt: number };

const pruneExpired = (storage: Storage, now: number) => {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
        const key = storage.key(i);
        if (key?.startsWith(KEY_PREFIX)) {
            try {
                const entry = JSON.parse(
                    storage.getItem(key) ?? '',
                ) as StoredHandoff;
                if (now - entry.createdAt > MAX_AGE_MS) storage.removeItem(key);
            } catch {
                storage.removeItem(key);
            }
        }
    }
};

/** Stores the handoff and returns its id, or null when storage is unavailable. */
export const writeSqlRunnerHandoff = (
    handoff: SqlRunnerHandoff,
): string | null => {
    try {
        const now = Date.now();
        pruneExpired(window.localStorage, now);
        const id = crypto.randomUUID();
        const entry: StoredHandoff = { ...handoff, createdAt: now };
        window.localStorage.setItem(KEY_PREFIX + id, JSON.stringify(entry));
        return id;
    } catch {
        return null;
    }
};

/** Reads without removing, so StrictMode's double initializers see the same entry. */
export const readSqlRunnerHandoff = (id: string): SqlRunnerHandoff | null => {
    try {
        const raw = window.localStorage.getItem(KEY_PREFIX + id);
        if (!raw) return null;
        const entry = JSON.parse(raw) as StoredHandoff;
        if (typeof entry.sql !== 'string') return null;
        if (Date.now() - entry.createdAt > MAX_AGE_MS) return null;
        const { createdAt: _createdAt, ...handoff } = entry;
        return handoff;
    } catch {
        return null;
    }
};

export const clearSqlRunnerHandoff = (id: string) => {
    try {
        window.localStorage.removeItem(KEY_PREFIX + id);
    } catch {
        // storage unavailable: the entry expires on the next write
    }
};
