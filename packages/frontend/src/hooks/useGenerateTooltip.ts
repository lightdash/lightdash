import {
    type ApiError,
    type GeneratedTooltip,
    type GenerateTooltipRequest,
    type TooltipFieldContext,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { lightdashApi } from '../api';

// 10 second timeout for AI tooltip generation
const TOOLTIP_GENERATION_TIMEOUT_MS = 10000;

const generateTooltipApi = async (
    projectUuid: string,
    payload: GenerateTooltipRequest,
    signal?: AbortSignal,
): Promise<GeneratedTooltip> =>
    lightdashApi({
        url: `/ai/${projectUuid}/tooltip/generate`,
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    }) as Promise<GeneratedTooltip>;

type UseGenerateTooltipOptions = {
    projectUuid: string | undefined;
    fields: string[];
    onSuccess?: (result: GeneratedTooltip) => void;
};

export const useGenerateTooltip = ({
    projectUuid,
    fields,
    onSuccess,
}: UseGenerateTooltipOptions) => {
    // Track abort controller to cancel in-flight requests
    const abortControllerRef = useRef<AbortController | null>(null);

    const mutation = useMutation<
        GeneratedTooltip,
        ApiError,
        { prompt: string; currentHtml?: string }
    >({
        onSuccess,
        mutationFn: ({ prompt, currentHtml }) => {
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
            }, TOOLTIP_GENERATION_TIMEOUT_MS);

            // Build fields context from available fields
            const fieldsContext: TooltipFieldContext[] = fields.map(
                (field) => ({
                    name: field,
                }),
            );

            return generateTooltipApi(
                projectUuid,
                {
                    prompt,
                    fieldsContext,
                    currentHtml,
                },
                controller.signal,
            ).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    });

    const generate = useCallback(
        (prompt: string, currentHtml?: string) => {
            if (!projectUuid || !prompt.trim()) return;
            mutation.mutate({ prompt, currentHtml });
        },
        [projectUuid, mutation],
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
