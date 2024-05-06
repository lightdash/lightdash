import { type ApiError, type ApiSqlQueryResults } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const runSqlQuery = async (projectUuid: string, sql: string) =>
    lightdashApi<ApiSqlQueryResults>({
        url: `/projects/${projectUuid}/sqlQuery`,
        method: 'POST',
        body: JSON.stringify({ sql }),
    });

export const useSqlQueryMutation = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { showToastApiError } = useToaster();
    return useMutation<ApiSqlQueryResults, ApiError, string>(
        (sql) => runSqlQuery(projectUuid, sql),
        {
            mutationKey: ['run_sql_query', projectUuid],
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to run sql query`,
                    apiError: error,
                });
            },
        },
    );
};
