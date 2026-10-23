import { useEffect, useRef } from 'react';
import { useAppSelector } from '../store/hooks';
import {
    selectFetchResultsOnLoad,
    selectIsConnectionReady,
    selectSql,
} from '../store/sqlRunnerSlice';
import { useSqlRunnerSignInReady } from './useSqlRunnerSignInReady';

// Runs the SQL once on load when asked to (saved chart edits, share links).
// Which tab opens is decided by whoever set fetchResultsOnLoad, never here.
export const useRunQueryOnLoad = ({
    runQuery,
    hasQueryResults,
}: {
    runQuery: (sql: string) => Promise<void>;
    hasQueryResults: boolean;
}) => {
    const fetchResultsOnLoad = useAppSelector(selectFetchResultsOnLoad);
    const sql = useAppSelector(selectSql);
    const isConnectionReady = useAppSelector(selectIsConnectionReady);
    const signInReady = useSqlRunnerSignInReady();
    const hasRunOnLoad = useRef(false);

    useEffect(() => {
        if (!isConnectionReady || !signInReady) return;
        if (!fetchResultsOnLoad || hasQueryResults) return;
        if (hasRunOnLoad.current || !sql) return;
        hasRunOnLoad.current = true;
        void runQuery(sql);
    }, [
        signInReady,
        isConnectionReady,
        fetchResultsOnLoad,
        runQuery,
        hasQueryResults,
        sql,
    ]);
};
