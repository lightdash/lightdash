import {
    CHART_METADATA_STYLES,
    type ApiError,
    type ChartMetadataStyle,
    type GenerateChartMetadataRequest,
    type GeneratedChartMetadata,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useExploreByProjectUuid } from '../../../../hooks/useExplore';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { useAmbientAiEnabled } from './useAmbientAiEnabled';
import {
    buildChartMetadataRequest,
    generateChartMetadataApi,
    getChartMetadataItemsMap,
    type ChartMetadataSource,
} from './useGenerateChartMetadata';

// The user asked for this one, so it can take longer than the save prefill
const REGENERATE_TIMEOUT_MS = 20000;

export type ChartMetadataField = 'name' | 'description';

/** What a field's regenerate button needs. */
export type RegenerateAction = {
    /** Accessible name and tooltip, e.g. "Regenerate chart name". */
    label: string;
    onClick: () => void;
    loading: boolean;
    disabled: boolean;
};

const REGENERATE_LABELS: Record<ChartMetadataField, string> = {
    name: 'Regenerate chart name',
    description: 'Regenerate chart description',
};

type StyleRequest = Pick<
    GenerateChartMetadataRequest,
    'style' | 'styleReferenceTitle'
>;

/**
 * What the `step`th click on a field's regenerate button asks for. Clicks
 * cycle through the naming styles, starting after `currentStyle`. When the
 * current style is unknown (a saved chart), the first click instead rewrites
 * the field for the chart as it is now, in the voice of `referenceTitle`.
 */
export const getRegenerateStyleRequest = (
    step: number,
    currentStyle: ChartMetadataStyle | undefined,
    referenceTitle: string | undefined,
): StyleRequest => {
    const count = CHART_METADATA_STYLES.length;
    if (currentStyle) {
        const start = CHART_METADATA_STYLES.indexOf(currentStyle) + 1;
        return { style: CHART_METADATA_STYLES[(start + step) % count] };
    }
    if (step === 0 && referenceTitle?.trim()) {
        return { styleReferenceTitle: referenceTitle };
    }
    // Without a title to follow, the first click starts the cycle instead
    const offset = referenceTitle?.trim() ? step - 1 : step;
    return { style: CHART_METADATA_STYLES[offset % count] };
};

type UseRegenerateChartMetadataOptions = {
    projectUuid: string | undefined;
    chart: ChartMetadataSource | undefined;
    /** Style the current values were generated in, if known. */
    currentStyle?: ChartMetadataStyle;
    /** Title to follow on the first click when the style is unknown. */
    referenceTitle?: string;
    onGenerated: (field: ChartMetadataField, value: string) => void;
    /** Off while the host modal is closed: loads nothing and resets the cycle. */
    enabled?: boolean;
    /** Disables the buttons, e.g. while the host form is saving. */
    disabled?: boolean;
};

/**
 * Regenerates a chart's name or description with ambient AI. Each click on a
 * field moves to the next naming style for that field.
 */
export const useRegenerateChartMetadata = ({
    projectUuid,
    chart,
    currentStyle,
    referenceTitle,
    onGenerated,
    enabled = true,
    disabled = false,
}: UseRegenerateChartMetadataOptions) => {
    const lightdashApi = useLightdashApi();
    const { showToastError } = useToaster();
    const isAmbientAiEnabled = useAmbientAiEnabled(projectUuid);
    const { data: explore } = useExploreByProjectUuid(
        chart?.tableName,
        projectUuid,
        {
            enabled:
                enabled &&
                isAmbientAiEnabled &&
                !!chart?.tableName &&
                !!projectUuid,
            // A failed load only leaves the button disabled; no error toast
            onError: () => {},
        },
    );

    const itemsMap = useMemo(
        () =>
            explore && chart
                ? getChartMetadataItemsMap(explore, chart)
                : undefined,
        [explore, chart],
    );

    // Clicks so far per field, so each field cycles on its own
    const steps = useRef<Record<ChartMetadataField, number>>({
        name: 0,
        description: 0,
    });
    const [loadingField, setLoadingField] = useState<ChartMetadataField | null>(
        null,
    );

    const onGeneratedRef = useRef(onGenerated);
    onGeneratedRef.current = onGenerated;

    // Results only apply while the host is mounted and open. Closing a modal
    // that stays mounted (the Update modal) must also cancel: otherwise a late
    // result lands in the closed form and counts as a step of the next cycle.
    const abortControllerRef = useRef<AbortController | null>(null);
    const isActiveRef = useRef(enabled);
    // The latest request; an older one it replaced must not touch state
    const requestIdRef = useRef(0);
    useEffect(() => {
        isActiveRef.current = enabled;
        if (!enabled) {
            abortControllerRef.current?.abort();
            setLoadingField(null);
            steps.current = { name: 0, description: 0 };
        }
        return () => {
            isActiveRef.current = false;
            abortControllerRef.current?.abort();
        };
    }, [enabled]);

    const isCurrent = (requestId: number) =>
        isActiveRef.current && requestId === requestIdRef.current;

    const mutation = useMutation<
        GeneratedChartMetadata,
        ApiError,
        {
            field: ChartMetadataField;
            payload: GenerateChartMetadataRequest;
            requestId: number;
        }
    >({
        mutationFn: ({ payload }) => {
            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const timeoutId = setTimeout(
                () => controller.abort(),
                REGENERATE_TIMEOUT_MS,
            );
            return generateChartMetadataApi(
                lightdashApi,
                projectUuid!,
                payload,
                controller.signal,
            ).finally(() => clearTimeout(timeoutId));
        },
        onSuccess: (result, { field, requestId }) => {
            if (!isCurrent(requestId)) return;
            steps.current[field] += 1;
            onGeneratedRef.current(
                field,
                field === 'name' ? result.title : result.description,
            );
        },
        onError: (_error, { field, requestId }) => {
            if (!isCurrent(requestId)) return;
            showToastError({
                title:
                    field === 'name'
                        ? "Couldn't regenerate the chart name"
                        : "Couldn't regenerate the chart description",
            });
        },
        onSettled: (_data, _error, { requestId }) => {
            if (isCurrent(requestId)) setLoadingField(null);
        },
    });

    const { mutate } = mutation;
    const regenerate = useCallback(
        (field: ChartMetadataField) => {
            if (!chart || !itemsMap || !projectUuid || disabled) return;
            setLoadingField(field);
            requestIdRef.current += 1;
            mutate({
                field,
                requestId: requestIdRef.current,
                payload: {
                    ...buildChartMetadataRequest(chart, itemsMap),
                    ...getRegenerateStyleRequest(
                        steps.current[field],
                        currentStyle,
                        referenceTitle,
                    ),
                },
            });
        },
        [
            chart,
            itemsMap,
            projectUuid,
            disabled,
            mutate,
            currentStyle,
            referenceTitle,
        ],
    );

    const isEnabled = enabled && isAmbientAiEnabled && !!chart;
    const isReady = !!itemsMap;

    /** Props for a field's regenerate button, or undefined when unavailable. */
    const getRegenerateProps = useCallback(
        (field: ChartMetadataField): RegenerateAction | undefined =>
            isEnabled
                ? {
                      label: REGENERATE_LABELS[field],
                      onClick: () => regenerate(field),
                      loading: loadingField === field,
                      // One field at a time, once the chart's fields have loaded
                      disabled:
                          disabled ||
                          !isReady ||
                          (loadingField !== null && loadingField !== field),
                  }
                : undefined,
        [isEnabled, isReady, disabled, loadingField, regenerate],
    );

    return {
        /** Whether regenerating is available: ambient AI is on for the project. */
        isEnabled,
        regenerate,
        loadingField,
        getRegenerateProps,
    };
};
