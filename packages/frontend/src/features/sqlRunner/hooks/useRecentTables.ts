import { useCallback, useMemo, useState } from 'react';
import { type TableRef } from '../utils/tableRows';

const MAX_RECENT_TABLES = 5;

const storageKey = (scope: string) => `sql-runner:recent-tables:${scope}`;

const isTableRef = (value: unknown): value is TableRef =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TableRef).database === 'string' &&
    typeof (value as TableRef).schema === 'string' &&
    typeof (value as TableRef).table === 'string';

const readRecentTables = (scope: string): TableRef[] => {
    try {
        const raw = window.localStorage.getItem(storageKey(scope));
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isTableRef) : [];
    } catch {
        return [];
    }
};

const isSameTable = (a: TableRef, b: TableRef) =>
    a.database === b.database && a.schema === b.schema && a.table === b.table;

// Last few tables opened in this browser, newest first. The scope is the
// project (plus the connection on multi-connection projects), so switching
// either reads a different list.
export const useRecentTables = (scope: string) => {
    const [version, setVersion] = useState(0);
    const recentTables = useMemo(
        () => readRecentTables(scope),
        // The version bumps after every write so the memo re-reads storage
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [scope, version],
    );

    const addRecentTable = useCallback(
        (table: TableRef) => {
            const next = [
                table,
                ...readRecentTables(scope).filter(
                    (ref) => !isSameTable(ref, table),
                ),
            ].slice(0, MAX_RECENT_TABLES);
            try {
                window.localStorage.setItem(
                    storageKey(scope),
                    JSON.stringify(next),
                );
            } catch {
                // Recents are a convenience; storage being blocked is fine
            }
            setVersion((previous) => previous + 1);
        },
        [scope],
    );

    return { recentTables, addRecentTable };
};
