import {
    type ApiError,
    type RawResultRow,
    type SqlRunnerBody,
    type VizColumn,
} from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { executeSqlQuery } from '../../queryRunner/executeQuery';

export type ResultsAndColumns = {
    queryUuid: string;
    fileUrl: string | undefined;
    results: RawResultRow[];
    columns: VizColumn[];
};

type UseSqlQueryRunParams = {
    sql: SqlRunnerBody['sql'];
    limit: SqlRunnerBody['limit'];
};

/**
 * Gets the SQL query results from the server
 * This is a hook that is used to get the results of a SQL query - used in the SQL runner
 */
export const useSqlQueryRun = (
    projectUuid: string,
    useMutationOptions?: UseMutationOptions<
        ResultsAndColumns | undefined,
        ApiError,
        UseSqlQueryRunParams
    >,
) => {
    return useMutation<
        ResultsAndColumns | undefined,
        ApiError,
        UseSqlQueryRunParams
    >(async ({ sql, limit }) => executeSqlQuery(projectUuid, sql, limit), {
        mutationKey: ['sqlRunner', 'run'],
        ...useMutationOptions,
    });
};
