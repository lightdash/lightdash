import {
    type ApiError,
    type GeneratedSqlRunnerQuery,
    type GenerateSqlRunnerQueryRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { lightdashApi } from '../../../api';

const GENERATION_TIMEOUT_MS = 20000;

const generateSqlRunnerQueryApi = async (
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

    return {
        generate,
        isLoading: mutation.isLoading,
        error: mutation.error,
    };
};
