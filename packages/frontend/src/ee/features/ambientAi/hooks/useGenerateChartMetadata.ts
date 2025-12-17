import {
    getItemMap,
    isField,
    type ApiError,
    type CreateSavedChartVersion,
    type Explore,
    type GenerateChartMetadataRequest,
    type GeneratedChartMetadata,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { lightdashApi } from '../../../../api';

// 5 second timeout for AI metadata generation - anything longer is too disruptive
const METADATA_GENERATION_TIMEOUT_MS = 5000;

const generateChartMetadataApi = async (
    projectUuid: string,
    payload: GenerateChartMetadataRequest,
    signal?: AbortSignal,
) =>
    lightdashApi<GeneratedChartMetadata>({
        url: `/ai/${projectUuid}/chart/generate-metadata`,
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    });

export type ChartMetadata = {
    name: string;
    description: string;
};

type UseGenerateChartMetadataOptions = {
    projectUuid: string | undefined;
    unsavedChartVersion: CreateSavedChartVersion;
    explore: Explore | undefined;
    /** Called when generation completes (with metadata) or fails (with null) */
    onComplete?: (metadata: ChartMetadata | null) => void;
};

/**
 * Generate chart metadata using ambient AI
 */
export const useGenerateChartMetadata = ({
    projectUuid,
    unsavedChartVersion,
    explore,
    onComplete,
}: UseGenerateChartMetadataOptions) => {
    const [generatedMetadata, setGeneratedMetadata] =
        useState<ChartMetadata | null>(null);

    // Track what chart state we last generated metadata for to avoid redundant requests
    const lastGeneratedForKey = useRef<string | null>(null);

    // Store latest onComplete callback in a ref to avoid stale closures
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    // Build itemsMap for AI metadata generation
    const itemsMap = useMemo(() => {
        if (!explore) return undefined;
        return getItemMap(
            explore,
            unsavedChartVersion.metricQuery.additionalMetrics,
            unsavedChartVersion.metricQuery.tableCalculations,
            unsavedChartVersion.metricQuery.customDimensions,
        );
    }, [
        explore,
        unsavedChartVersion.metricQuery.additionalMetrics,
        unsavedChartVersion.metricQuery.tableCalculations,
        unsavedChartVersion.metricQuery.customDimensions,
    ]);

    // Use the entire unsavedChartVersion as the key - any change triggers regeneration
    const chartStateKey = useMemo(
        () => JSON.stringify(unsavedChartVersion),
        [unsavedChartVersion],
    );

    // Track abort controller to cancel in-flight requests
    const abortControllerRef = useRef<AbortController | null>(null);

    const mutation = useMutation<
        GeneratedChartMetadata,
        ApiError,
        GenerateChartMetadataRequest
    >({
        mutationFn: (payload) => {
            if (!projectUuid) {
                throw new Error('Project UUID is required');
            }

            // Cancel any in-flight request
            abortControllerRef.current?.abort();

            // Create new controller with timeout
            const controller = new AbortController();
            abortControllerRef.current = controller;

            // Auto-abort after timeout
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, METADATA_GENERATION_TIMEOUT_MS);

            return generateChartMetadataApi(
                projectUuid,
                payload,
                controller.signal,
            ).finally(() => {
                clearTimeout(timeoutId);
            });
        },
        onSuccess: (result) => {
            const metadata = {
                name: result.title,
                description: result.description,
            };
            setGeneratedMetadata(metadata);
            onCompleteRef.current?.(metadata);
        },
        // On error (timeout, network, API error), just continue without metadata
        // The modal will open with empty fields for the user to fill in
        onError: () => {
            onCompleteRef.current?.(null);
        },
    });

    // Check if chart state has changed since last generation
    const hasChartChanged = lastGeneratedForKey.current !== chartStateKey;

    // Trigger AI metadata generation
    const trigger = useCallback(() => {
        if (!projectUuid || !itemsMap) return;

        // Skip if we already generated for this exact chart state
        if (lastGeneratedForKey.current === chartStateKey) return;

        lastGeneratedForKey.current = chartStateKey;

        // Reset previous metadata
        setGeneratedMetadata(null);

        const usedFieldIds = new Set([
            ...unsavedChartVersion.metricQuery.dimensions,
            ...unsavedChartVersion.metricQuery.metrics,
            ...(unsavedChartVersion.metricQuery.tableCalculations ?? []).map(
                (tc) => tc.name,
            ),
        ]);

        const fieldsContext = Object.entries(itemsMap)
            .filter(([id]) => usedFieldIds.has(id))
            .map(([id, item]) => ({
                id,
                name: item.name,
                label: isField(item)
                    ? item.label
                    : 'displayName' in item
                    ? item.displayName ?? item.name
                    : item.name,
                description: isField(item) ? item.description : undefined,
                type: item.type ?? 'unknown',
            }));

        mutation.mutate({
            tableName: unsavedChartVersion.tableName,
            chartType: unsavedChartVersion.chartConfig?.type ?? 'unknown',
            dimensions: unsavedChartVersion.metricQuery.dimensions,
            metrics: unsavedChartVersion.metricQuery.metrics,
            filters: unsavedChartVersion.metricQuery.filters,
            fieldsContext,
            chartConfigJson: unsavedChartVersion.chartConfig?.config
                ? JSON.stringify(unsavedChartVersion.chartConfig.config)
                : undefined,
        });
    }, [projectUuid, itemsMap, chartStateKey, unsavedChartVersion, mutation]);

    return {
        generatedMetadata,
        trigger,
        hasChartChanged,
        isLoading: mutation.isLoading,
    };
};
