import { ApiError, ApiSqlQueryResults } from '@lightdash/common';
import { useMutation } from 'react-query';
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
    const { showToastError } = useToaster();
    return useMutation<ApiSqlQueryResults, ApiError, string>(
        (sql) => runSqlQuery(projectUuid, sql),
        {
            mutationKey: ['run_sql_query', projectUuid],
            onError: (error) => {
                showToastError({
                    title: `Failed to run sql query`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
