import {
    type ApiError,
    type GeneratedSqlRunnerQuery,
    type GenerateSqlRunnerQueryRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

// The server may look up several tables before answering
const GENERATION_TIMEOUT_MS = 45000;

const generateSqlRunnerQueryApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    payload: GenerateSqlRunnerQueryRequest,
    signal?: AbortSignal,
) =>
    lightdashApi<GeneratedSqlRunnerQuery>({
        url: `/ai/${projectUuid}/sql-runner/generate`,
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    });

type Options = {
    projectUuid: string | undefined;
    onSuccess: (
        result: GeneratedSqlRunnerQuery,
        request: GenerateSqlRunnerQueryRequest,
    ) => void;
    onError: () => void;
};

export const useGenerateSqlRunnerQuery = ({
    projectUuid,
    onSuccess,
    onError,
}: Options) => {
    const lightdashApi = useLightdashApi();
    const abortControllerRef = useRef<AbortController | null>(null);

    const mutation = useMutation<
        GeneratedSqlRunnerQuery,
        ApiError,
        GenerateSqlRunnerQueryRequest
    >({
        onSuccess,
        onError,
        mutationFn: (request) => {
            if (!projectUuid) {
                throw new Error('Project UUID is required');
            }

            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;

            const timeoutId = setTimeout(() => {
                controller.abort();
            }, GENERATION_TIMEOUT_MS);

            return generateSqlRunnerQueryApi(
                lightdashApi,
                projectUuid,
                request,
                controller.signal,
            ).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    });

    const generate = useCallback(
        (request: GenerateSqlRunnerQueryRequest) => {
            if (!projectUuid || !request.prompt.trim()) return;
            mutation.mutate(request);
        },
        [projectUuid, mutation],
    );

    const cancel = useCallback(() => {
        abortControllerRef.current?.abort();
    }, []);

    return {
        generate,
        cancel,
        isLoading: mutation.isLoading,
        error: mutation.error,
    };
};
