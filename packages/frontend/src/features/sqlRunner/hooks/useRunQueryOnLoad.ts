import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    selectFetchResultsOnLoad,
    selectIsConnectionReady,
    selectSql,
    setActiveEditorTab,
} from '../store/sqlRunnerSlice';

export const useRunQueryOnLoad = ({
    runQuery,
    hasQueryResults,
}: {
    runQuery: (sql: string) => Promise<void>;
    hasQueryResults: boolean;
}) => {
    const dispatch = useAppDispatch();
    const fetchResultsOnLoad = useAppSelector(selectFetchResultsOnLoad);
    const sql = useAppSelector(selectSql);
    const mode = useAppSelector((state) => state.sqlRunner.mode);
    const isConnectionReady = useAppSelector(selectIsConnectionReady);
    const hasRunOnLoad = useRef(false);

    useEffect(() => {
        if (!isConnectionReady) return;
        if (fetchResultsOnLoad && !hasQueryResults) {
            if (hasRunOnLoad.current || !sql) return;
            hasRunOnLoad.current = true;
            void runQuery(sql);
        } else if (
            fetchResultsOnLoad &&
            hasQueryResults &&
            mode === 'default'
        ) {
            dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
        }
    }, [
        isConnectionReady,
        fetchResultsOnLoad,
        runQuery,
        hasQueryResults,
        dispatch,
        sql,
        mode,
    ]);
};
