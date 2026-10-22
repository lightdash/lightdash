import {
    type ApiError,
    type ParametersValuesMap,
    type RawResultRow,
    type SqlRunnerBody,
    type VizColumn,
} from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
    captureSharedSignInQueryScope,
    canReplaySharedSignInQueryScope,
    isCurrentSharedSignInQueryScope,
    isWarehouseSignInQueryError,
} from '../../../hooks/sharedSignInQueryRecovery';
import { SHARED_SIGN_IN_RECONNECTED } from '../../../hooks/useReconnectSharedSignIn';
import { reportSharedSignInQueryFailure } from '../../../hooks/useReconnectSharedSignIn';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { useAppSelector } from '../store/hooks';
import { selectConnectionUuid } from '../store/sqlRunnerSlice';

export type ResultsAndColumns = {
    queryUuid: string;
    fileUrl: string | undefined;
    results: RawResultRow[];
    columns: VizColumn[];
    durationMs: number | null;
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
    const lightdashApi = useLightdashApi();
    const warehouseConnectionUuid = useAppSelector(selectConnectionUuid);
    const lastFailedRun = useRef<{
        variables: UseSqlQueryRunParams;
        projectUuid: string;
        warehouseConnectionUuid: string | null | undefined;
        scope: ReturnType<typeof captureSharedSignInQueryScope>;
    } | null>(null);
    const sequence = useRef(0);
    useEffect(
        () => () => {
            sequence.current += 1;
            lastFailedRun.current = null;
        },
        [projectUuid, warehouseConnectionUuid],
    );
    const mutation = useMutation<
        ResultsAndColumns | undefined,
        ApiError,
        UseSqlQueryRunParams
    >(
        async (variables) => {
            const request = ++sequence.current;
            const scope = captureSharedSignInQueryScope(projectUuid);
            lastFailedRun.current = null;
            try {
                return await executeSqlQuery(
                    lightdashApi,
                    projectUuid,
                    variables.sql,
                    variables.limit,
                    variables.parameterValues,
                    undefined,
                    warehouseConnectionUuid,
                );
            } catch (error) {
                if (
                    request === sequence.current &&
                    (!scope || isCurrentSharedSignInQueryScope(scope)) &&
                    isWarehouseSignInQueryError(error)
                )
                    lastFailedRun.current = {
                        variables,
                        projectUuid,
                        warehouseConnectionUuid,
                        scope,
                    };
                reportSharedSignInQueryFailure(projectUuid, error, scope);
                throw error;
            }
        },
        {
            mutationKey: ['sqlRunner', 'run'],
            ...useMutationOptions,
            onError: (error, variables, context) => {
                useMutationOptions?.onError?.(error, variables, context);
            },
            onSuccess: (data, variables, context) => {
                useMutationOptions?.onSuccess?.(data, variables, context);
            },
        },
    );
    const { mutate } = mutation;
    useEffect(() => {
        const retryFailedRun = (event: Event) => {
            if (
                event instanceof CustomEvent &&
                event.detail === projectUuid &&
                lastFailedRun.current?.projectUuid === projectUuid &&
                lastFailedRun.current.warehouseConnectionUuid ===
                    warehouseConnectionUuid &&
                canReplaySharedSignInQueryScope(lastFailedRun.current.scope)
            ) {
                const failed = lastFailedRun.current;
                lastFailedRun.current = null;
                mutate(failed.variables);
            }
        };
        window.addEventListener(SHARED_SIGN_IN_RECONNECTED, retryFailedRun);
        return () =>
            window.removeEventListener(
                SHARED_SIGN_IN_RECONNECTED,
                retryFailedRun,
            );
    }, [mutate, projectUuid, warehouseConnectionUuid]);
    return mutation;
};
