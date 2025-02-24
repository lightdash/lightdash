import type { FC } from 'react';
import { Provider } from 'react-redux';
import { Navigate, useLocation, useParams } from 'react-router';
import { store } from '../features/sqlRunner/store';
import { useAppDispatch } from '../features/sqlRunner/store/hooks';
import { setSql } from '../features/sqlRunner/store/sqlRunnerSlice';

const RedirectToSqlRunner: FC = () => {
    const dispatch = useAppDispatch();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { search } = useLocation();
    const searchParams = new URLSearchParams(search);
    const sqlRunnerSearchParam = searchParams.get('sql_runner');
    const legacySqlState = sqlRunnerSearchParam
        ? JSON.parse(sqlRunnerSearchParam)
        : undefined;

    if (projectUuid && legacySqlState) {
        // Note: In development, the SqlRunner state is reset so it doesn't work. If you want to debug this, disable React.StrictMode in packages/frontend/src/index.tsx
        dispatch(setSql(legacySqlState.sql));
    }

    return <Navigate to={`/projects/${projectUuid}/sql-runner`} replace />;
};

const LegacySqlRunner: FC = () => {
    return (
        <Provider store={store}>
            <RedirectToSqlRunner />
        </Provider>
    );
};

export default LegacySqlRunner;
