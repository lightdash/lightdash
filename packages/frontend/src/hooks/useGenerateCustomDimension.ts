import {
    getDimensions,
    getItemId,
    type ApiError,
    type Explore,
    type GeneratedCustomDimension,
    type GenerateCustomDimensionRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { lightdashApi } from '../api';

const CUSTOM_DIMENSION_GENERATION_TIMEOUT_MS = 10000;

const generateCustomDimensionApi = async (
    projectUuid: string,
    payload: GenerateCustomDimensionRequest,
    signal?: AbortSignal,
) =>
    lightdashApi<GeneratedCustomDimension>({
        url: `/ai/${projectUuid}/custom-dimension/generate`,
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    });

type UseGenerateCustomDimensionOptions = {
    projectUuid: string | undefined;
    explore: Explore | undefined;
    onSuccess?: (result: GeneratedCustomDimension) => void;
};

export const useGenerateCustomDimension = ({
    projectUuid,
    explore,
    onSuccess,
}: UseGenerateCustomDimensionOptions) => {
    const abortControllerRef = useRef<AbortController | null>(null);
    const mutation = useMutation<
        GeneratedCustomDimension,
        ApiError,
        { prompt: string; currentSql?: string }
    >({
        onSuccess,
        mutationFn: ({ prompt, currentSql }) => {
            if (!projectUuid || !explore) {
                throw new Error('Project UUID and explore are required');
            }

            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const timeoutId = setTimeout(
                () => controller.abort(),
                CUSTOM_DIMENSION_GENERATION_TIMEOUT_MS,
            );

            const fieldsContext = getDimensions(explore).map((field) => ({
                id: getItemId(field),
                name: field.name,
                table: field.table,
                label: field.label,
                type: field.type,
                description: field.description,
            }));

            return generateCustomDimensionApi(
                projectUuid,
                {
                    prompt,
                    tableName: explore.label ?? explore.name,
                    fieldsContext,
                    currentSql,
                },
                controller.signal,
            ).finally(() => clearTimeout(timeoutId));
        },
    });

    const generate = useCallback(
        (prompt: string, currentSql?: string) => {
            if (!projectUuid || !explore || !prompt.trim()) return;
            mutation.mutate({ prompt, currentSql });
        },
        [projectUuid, explore, mutation],
    );

    return {
        generate,
        isLoading: mutation.isLoading,
        error: mutation.error,
    };
};
