import {
    type ApiError,
    type Explore,
    type GeneratedFormulaTableCalculation,
    type GenerateFormulaTableCalculationRequest,
    type MetricQuery,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { lightdashApi } from '../api';
import { useFormulaAiContext } from './useFormulaAiContext';

const GENERATION_TIMEOUT_MS = 15000;

const convertSqlToFormulaApi = async (
    projectUuid: string,
    payload: GenerateFormulaTableCalculationRequest,
    signal?: AbortSignal,
) =>
    lightdashApi<GeneratedFormulaTableCalculation>({
        url: `/ai/${projectUuid}/formula-table-calculation/generate`,
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    });

type UseConvertSqlToFormulaOptions = {
    projectUuid: string | undefined;
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    onSuccess?: (result: GeneratedFormulaTableCalculation) => void;
};

export const useConvertSqlToFormula = ({
    projectUuid,
    explore,
    metricQuery,
    onSuccess,
}: UseConvertSqlToFormulaOptions) => {
    const abortControllerRef = useRef<AbortController | null>(null);
    const { buildContext, isReady } = useFormulaAiContext(explore, metricQuery);

    const mutation = useMutation<
        GeneratedFormulaTableCalculation,
        ApiError,
        { sourceSql: string }
    >({
        onSuccess,
        mutationFn: ({ sourceSql }) => {
            if (!projectUuid) {
                throw new Error('Project UUID is required');
            }

            const context = buildContext();
            if (!context) {
                throw new Error('Formula AI context is not ready');
            }

            abortControllerRef.current?.abort();

            const controller = new AbortController();
            abortControllerRef.current = controller;

            const timeoutId = setTimeout(() => {
                controller.abort();
            }, GENERATION_TIMEOUT_MS);

            return convertSqlToFormulaApi(
                projectUuid,
                {
                    mode: 'convert-sql',
                    sourceSql,
                    ...context,
                },
                controller.signal,
            ).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    });

    const convert = useCallback(
        (sourceSql: string) => {
            if (!projectUuid || !isReady || !sourceSql.trim()) return;
            mutation.mutate({ sourceSql });
        },
        [projectUuid, isReady, mutation],
    );

    const reset = useCallback(() => {
        abortControllerRef.current?.abort();
        mutation.reset();
    }, [mutation]);

    return {
        convert,
        reset,
        result: mutation.data ?? null,
        isLoading: mutation.isLoading,
        error: mutation.error,
    };
};
