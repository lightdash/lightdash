import { subject } from '@casl/ability';
import {
    type ApiError,
    type ApiJobScheduledResponse,
    type ValidationResponse,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useLocalStorageState from 'use-local-storage-state';
import { lightdashApi } from '../../api';
import { pollJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../toaster/useToaster';
import { useProject } from '../useProject';
import useUser from '../user/useUser';

const LAST_VALIDATION_NOTIFICATION_KEY = 'lastValidationTimestamp';

const getValidation = async (
    projectUuid: string,
    fromSettings: boolean,
): Promise<ValidationResponse[]> =>
    lightdashApi<ValidationResponse[]>({
        url: `/projects/${projectUuid}/validate?fromSettings=${fromSettings.toString()}`,
        method: 'GET',
        body: undefined,
    });

export const useValidation = (
    projectUuid: string,
    fromSettings: boolean = false,
) => {
    const [lastValidationNotification, setLastValidationNotification] =
        useLocalStorageState<string>(LAST_VALIDATION_NOTIFICATION_KEY);

    return useQuery<ValidationResponse[], ApiError>({
        queryKey: ['validation', fromSettings],
        queryFn: () => getValidation(projectUuid, fromSettings),
        retry: (_, error) => error.error.statusCode !== 403,
        staleTime: 0,
        onSuccess: (data) => {
            if (data.length === 0) return;
            const latestValidationTimestamp = data[0].createdAt.toString();
            const previousTimestamp = lastValidationNotification?.split(';')[0];

            // When it's empty, no last validation
            if (lastValidationNotification === '') {
                setLastValidationNotification(
                    `${latestValidationTimestamp};unread`,
                );
                return;
            }

            if (latestValidationTimestamp === previousTimestamp) return;

            // if they're not the same, update the last validation
            setLastValidationNotification(
                `${latestValidationTimestamp};unread`,
            );
        },
    });
};

const updateValidation = async (
    projectUuid: string,
): Promise<ApiJobScheduledResponse['results']> =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/validate`,
        method: 'POST',
        body: undefined,
    });

export const useValidationMutation = (
    projectUuid: string,
    onComplete: () => void,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError, showToastApiError } =
        useToaster();

    return useMutation<ApiJobScheduledResponse['results'], ApiError>({
        mutationKey: ['validation', projectUuid],
        mutationFn: () => updateValidation(projectUuid),
        onSuccess: (data) => {
            // Wait until validation is complete
            pollJobStatus(data.jobId)
                .then(async () => {
                    onComplete();
                    // Invalidate validation to get latest results
                    await queryClient.invalidateQueries({
                        queryKey: ['validation'],
                    });
                    showToastSuccess({ title: 'Validation completed' });
                })
                .catch((error: Error) => {
                    showToastError({
                        title: 'Unable to update validation',
                        subtitle: error.message,
                    });
                });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update validation',
                apiError: error,
            });
        },
    });
};

export const useValidationUserAbility = (projectUuid: string) => {
    const { data: user } = useUser(true);
    const { data: project } = useProject(projectUuid);
    const canUserSeeValidationErrorsNotifications =
        !!user &&
        !!project &&
        user.ability?.can(
            'manage',
            subject('Validation', {
                organizationUuid: project.organizationUuid,
                projectUuid,
            }),
        );
    return canUserSeeValidationErrorsNotifications;
};

export const useValidationNotificationChecker = (): [boolean, () => void] => {
    const [lastValidationNotification, setLastValidationNotification] =
        useLocalStorageState<string>(LAST_VALIDATION_NOTIFICATION_KEY);

    const [lastValidationTimestamp = '', lastValidationStatus = ''] =
        lastValidationNotification ? lastValidationNotification.split(';') : [];

    const hasReadLastValidationNotification =
        !!lastValidationNotification && lastValidationStatus === 'read';

    const setHasReadLastValidationNotification = () =>
        lastValidationNotification &&
        setLastValidationNotification(`${lastValidationTimestamp};read`);

    return [
        hasReadLastValidationNotification,
        setHasReadLastValidationNotification,
    ];
};

const deleteValidation = async (
    projectUuid: string,
    validationId: number,
): Promise<null> =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/validate/${validationId}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteValidation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, number>(
        (validationId) => deleteValidation(projectUuid, validationId),
        {
            mutationKey: ['delete_validation', projectUuid],
            onSuccess: async () => {
                await queryClient.refetchQueries(['validation']);
                showToastSuccess({
                    title: 'Validation dismissed',
                });
            },
            onError: async ({ error }) => {
                showToastApiError({
                    title: 'Failed to dismiss validation',
                    apiError: error,
                });
            },
        },
    );
};
