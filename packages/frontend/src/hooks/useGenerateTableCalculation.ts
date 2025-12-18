import {
    getItemMap,
    isField,
    isTableCalculation,
    type ApiError,
    type Explore,
    type GeneratedTableCalculation,
    type GenerateTableCalculationRequest,
    type MetricQuery,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { lightdashApi } from '../api';

// 10 second timeout for AI table calculation generation
const TABLE_CALC_GENERATION_TIMEOUT_MS = 10000;

const generateTableCalculationApi = async (
    projectUuid: string,
    payload: GenerateTableCalculationRequest,
    signal?: AbortSignal,
) =>
    lightdashApi<GeneratedTableCalculation>({
        url: `/ai/${projectUuid}/table-calculation/generate`,
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    });

type UseGenerateTableCalculationOptions = {
    projectUuid: string | undefined;
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    onSuccess?: (result: GeneratedTableCalculation) => void;
};

export const useGenerateTableCalculation = ({
    projectUuid,
    explore,
    metricQuery,
    onSuccess,
}: UseGenerateTableCalculationOptions) => {
    // Track abort controller to cancel in-flight requests
    const abortControllerRef = useRef<AbortController | null>(null);

    // Build itemsMap for field context
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
        GeneratedTableCalculation,
        ApiError,
        { prompt: string; currentSql?: string }
    >({
        onSuccess,
        mutationFn: ({ prompt, currentSql }) => {
            if (!projectUuid || !itemsMap) {
                throw new Error('Project UUID and itemsMap are required');
            }

            // Cancel any in-flight request
            abortControllerRef.current?.abort();

            // Create new controller with timeout
            const controller = new AbortController();
            abortControllerRef.current = controller;

            // Auto-abort after timeout
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, TABLE_CALC_GENERATION_TIMEOUT_MS);

            // Build fields context from all available fields
            const usedFieldIds = new Set([
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...(metricQuery.tableCalculations ?? []).map((tc) => tc.name),
            ]);

            // Get the base table name from explore for table calculations
            const baseTableName = explore?.baseTable ?? '';

            const fieldsContext = Object.entries(itemsMap)
                .filter(([id]) => usedFieldIds.has(id))
                .map(([, item]) => ({
                    name: item.name,
                    // For fields, use their table; for table calculations, use the base table
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

            return generateTableCalculationApi(
                projectUuid,
                {
                    prompt,
                    tableName,
                    fieldsContext,
                    existingTableCalculations,
                    currentSql,
                },
                controller.signal,
            ).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    });

    const generate = useCallback(
        (prompt: string, currentSql?: string) => {
            if (!projectUuid || !itemsMap || !prompt.trim()) return;
            mutation.mutate({ prompt, currentSql });
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
