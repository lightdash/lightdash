import { ApiError, ValidationResponse } from '@lightdash/common';
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import { useErrorLogs } from '../../providers/ErrorLogsProvider';
import useToaster from '../toaster/useToaster';

const getValidation = async (
    projectUuid: string,
): Promise<ValidationResponse[]> =>
    lightdashApi<ValidationResponse[]>({
        url: `/projects/${projectUuid}/validate`,
        method: 'GET',
        body: undefined,
    });

export const useValidation = (projectUuid: string) =>
    useQuery<ValidationResponse[], ApiError>({
        queryKey: 'validation',
        queryFn: () => getValidation(projectUuid),
    });

const updateValidation = async (
    projectUuid: string,
): Promise<ValidationResponse[]> =>
    lightdashApi<ValidationResponse[]>({
        url: `/projects/${projectUuid}/validate`,
        method: 'POST',
        body: undefined,
    });

export const useValidationMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showError } = useErrorLogs();
    const { showToastSuccess } = useToaster();

    return useMutation<ValidationResponse[], ApiError>({
        mutationKey: ['validation', projectUuid],
        mutationFn: () => updateValidation(projectUuid),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['validation'] });
            showToastSuccess({
                title: 'Success! Validation complete.',
            });
        },
        onError: useCallback(
            (error) => {
                const [title, ...rest] = error.error.message.split('\n');
                showError({
                    title,
                    body: rest.join('\n'),
                });
            },
            [showError],
        ),
    });
};
