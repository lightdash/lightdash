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

const generateFormulaTableCalculationApi = async (
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

type UseGenerateFormulaTableCalculationOptions = {
    projectUuid: string | undefined;
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    onSuccess?: (result: GeneratedFormulaTableCalculation) => void;
};

export const useGenerateFormulaTableCalculation = ({
    projectUuid,
    explore,
    metricQuery,
    onSuccess,
}: UseGenerateFormulaTableCalculationOptions) => {
    const abortControllerRef = useRef<AbortController | null>(null);
    const { buildContext, isReady } = useFormulaAiContext(explore, metricQuery);

    const mutation = useMutation<
        GeneratedFormulaTableCalculation,
        ApiError,
        { prompt: string; currentFormula?: string }
    >({
        onSuccess,
        mutationFn: ({ prompt, currentFormula }) => {
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

            return generateFormulaTableCalculationApi(
                projectUuid,
                {
                    mode: 'prompt',
                    prompt,
                    currentFormula,
                    ...context,
                },
                controller.signal,
            ).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    });

    const generate = useCallback(
        (prompt: string, currentFormula?: string) => {
            if (!projectUuid || !isReady || !prompt.trim()) return;
            mutation.mutate({ prompt, currentFormula });
        },
        [projectUuid, isReady, mutation],
    );

    const reset = useCallback(() => {
        mutation.reset();
    }, [mutation]);

    return {
        generate,
        reset,
        generatedResult: mutation.data ?? null,
        isLoading: mutation.isLoading,
        error: mutation.error,
    };
};
