import { ApiError, ApiSqlQueryResults } from 'common';
import { useMutation } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const runSqlQuery = async (projectUuid: string, sql: string) =>
    lightdashApi<ApiSqlQueryResults>({
        url: `/projects/${projectUuid}/sqlQuery`,
        method: 'POST',
        body: JSON.stringify({ sql }),
    });

export const useSqlQueryMutation = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { showToastError } = useApp();
    return useMutation<ApiSqlQueryResults, ApiError, string>(
        (sql) => runSqlQuery(projectUuid, sql),
        {
            mutationKey: ['run_sql_query'],
            onError: (error) => {
                showToastError({
                    title: `Failed to run sql query`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
