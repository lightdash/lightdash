import {
    getItemMap,
    isField,
    isTableCalculation,
    type ApiError,
    type Explore,
    type GeneratedFormulaTableCalculation,
    type GenerateFormulaTableCalculationRequest,
    type MetricQuery,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { lightdashApi } from '../api';

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

    const itemsMap = useMemo(() => {
        if (!explore) return undefined;
        return getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
            metricQuery.customDimensions,
        );
    }, [
        explore,
        metricQuery.additionalMetrics,
        metricQuery.tableCalculations,
        metricQuery.customDimensions,
    ]);

    const tableName = explore?.label ?? explore?.name ?? '';

    const mutation = useMutation<
        GeneratedFormulaTableCalculation,
        ApiError,
        { prompt: string; currentFormula?: string }
    >({
        onSuccess,
        mutationFn: ({ prompt, currentFormula }) => {
            if (!projectUuid || !itemsMap) {
                throw new Error('Project UUID and itemsMap are required');
            }

            abortControllerRef.current?.abort();

            const controller = new AbortController();
            abortControllerRef.current = controller;

            const timeoutId = setTimeout(() => {
                controller.abort();
            }, GENERATION_TIMEOUT_MS);

            const usedFieldIds = new Set([
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...(metricQuery.tableCalculations ?? []).map((tc) => tc.name),
            ]);

            const baseTableName = explore?.baseTable ?? '';

            const fieldsContext = Object.entries(itemsMap)
                .filter(([id]) => usedFieldIds.has(id))
                .map(([, item]) => ({
                    name: item.name,
                    table: isField(item) ? item.table : baseTableName,
                    label: isField(item)
                        ? item.label
                        : isTableCalculation(item)
                          ? (item.displayName ?? item.name)
                          : item.name,
                    type: item.type ?? 'unknown',
                    description: isField(item) ? item.description : undefined,
                    fieldType: isField(item)
                        ? item.fieldType === 'dimension'
                            ? ('dimension' as const)
                            : ('metric' as const)
                        : ('table_calculation' as const),
                }));

            const existingTableCalculations = (
                metricQuery.tableCalculations ?? []
            ).map((tc) => tc.displayName);

            return generateFormulaTableCalculationApi(
                projectUuid,
                {
                    prompt,
                    tableName,
                    fieldsContext,
                    existingTableCalculations,
                    currentFormula,
                },
                controller.signal,
            ).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    });

    const generate = useCallback(
        (prompt: string, currentFormula?: string) => {
            if (!projectUuid || !itemsMap || !prompt.trim()) return;
            mutation.mutate({ prompt, currentFormula });
        },
        [projectUuid, itemsMap, mutation],
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
