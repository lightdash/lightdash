import {
    FeatureFlags,
    type ApiError,
    type ParametersValuesMap,
    type RawResultRow,
    type SqlRunnerBody,
    type VizColumn,
} from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { SHARED_SIGN_IN_RECONNECTED } from '../../../hooks/useReconnectSharedSignIn';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { useAppSelector } from '../store/hooks';
import { selectConnectionUuid } from '../store/sqlRunnerSlice';

export type ResultsAndColumns = {
    queryUuid: string;
    fileUrl: string | undefined;
    results: RawResultRow[];
    columns: VizColumn[];
};

type UseSqlQueryRunParams = {
    sql: SqlRunnerBody['sql'];
    limit: SqlRunnerBody['limit'];
    parameterValues?: ParametersValuesMap;
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
    const warehouseConnectionUuid = useAppSelector(selectConnectionUuid);
    const lastFailedRun = useRef<UseSqlQueryRunParams | null>(null);
    const expiredStateFlag = useServerFeatureFlag(
        FeatureFlags.ExpiredSignInState,
    );
    const mutation = useMutation<
        ResultsAndColumns | undefined,
        ApiError,
        UseSqlQueryRunParams
    >(
        async ({ sql, limit, parameterValues }) =>
            executeSqlQuery(
                projectUuid,
                sql,
                limit,
                parameterValues,
                undefined,
                warehouseConnectionUuid,
            ),
        {
            mutationKey: ['sqlRunner', 'run'],
            ...useMutationOptions,
            onError: (error, variables, context) => {
                lastFailedRun.current = variables;
                useMutationOptions?.onError?.(error, variables, context);
            },
            onSuccess: (data, variables, context) => {
                lastFailedRun.current = null;
                useMutationOptions?.onSuccess?.(data, variables, context);
            },
        },
    );
    const { mutate } = mutation;
    useEffect(() => {
        const retryFailedRun = (event: Event) => {
            if (
                event.type === 'warehouse-sign-in-reconnected' &&
                expiredStateFlag.data?.enabled !== true
            )
                return;
            if (
                event instanceof CustomEvent &&
                event.detail === projectUuid &&
                lastFailedRun.current
            ) {
                mutate(lastFailedRun.current);
            }
        };
        window.addEventListener(SHARED_SIGN_IN_RECONNECTED, retryFailedRun);
        window.addEventListener(
            'warehouse-sign-in-reconnected',
            retryFailedRun,
        );
        return () => {
            window.removeEventListener(
                SHARED_SIGN_IN_RECONNECTED,
                retryFailedRun,
            );
            window.removeEventListener(
                'warehouse-sign-in-reconnected',
                retryFailedRun,
            );
        };
    }, [mutate, projectUuid, expiredStateFlag.data?.enabled]);
    return mutation;
};
