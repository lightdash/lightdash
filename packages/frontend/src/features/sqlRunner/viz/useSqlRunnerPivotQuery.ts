import {
    type ApiError,
    type ParametersValuesMap,
    type PivotConfiguration,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { submitSqlQuery } from '../utils/executeSqlQuery';

type Args = {
    projectUuid: string;
    sql: string;
    limit: number | undefined;
    parameterValues: ParametersValuesMap;
    warehouseConnectionUuid: string | null | undefined;
    /** The run the chart draws; a pivot is a re-run of its statement. */
    sourceQueryUuid: string | undefined;
    /** Addressed by result column; null when the chart needs no pivot. */
    pivotConfiguration: PivotConfiguration | null;
};

/**
 * The pivoted re-run of the editor's statement, as a grouped chart needs
 * it: the warehouse pivots the statement's rows the way a saved chart's run
 * does, and the chart reads the pivoted result. Idle without a run or a
 * pivot to apply; keyed by the run so a new run pivots again.
 */
export const useSqlRunnerPivotQuery = ({
    projectUuid,
    sql,
    limit,
    parameterValues,
    warehouseConnectionUuid,
    sourceQueryUuid,
    pivotConfiguration,
}: Args) =>
    useQuery<{ queryUuid: string }, ApiError>({
        queryKey: [
            'sqlRunner',
            'pivot',
            projectUuid,
            sourceQueryUuid,
            limit,
            pivotConfiguration,
        ],
        queryFn: () =>
            submitSqlQuery({
                projectUuid,
                sql,
                limit,
                parameterValues,
                invalidateCache: true,
                warehouseConnectionUuid,
                pivotConfiguration: pivotConfiguration ?? undefined,
            }),
        enabled: !!sourceQueryUuid && pivotConfiguration !== null && !!sql,
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
    });
