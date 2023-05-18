import { subject } from '@casl/ability';
import {
    ApiError,
    ApiJobScheduledResponse,
    ValidationResponse,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import { useErrorLogs } from '../../providers/ErrorLogsProvider';
import { pollJobStatus } from '../scheduler/useScheduler';
import useToaster from '../toaster/useToaster';
import { useProject } from '../useProject';
import useUser from '../user/useUser';

const LAST_VALIDATION_NOTIFICATION_KEY = 'lastValidationTimestamp';

const getValidation = async (
    projectUuid: string,
): Promise<ValidationResponse[]> =>
    lightdashApi<ValidationResponse[]>({
        url: `/projects/${projectUuid}/validate`,
        method: 'GET',
        body: undefined,
    });

export const useValidation = (projectUuid: string) => {
    const [lastValidationNotification, setLastValidationNotification] =
        useLocalStorage({
            key: LAST_VALIDATION_NOTIFICATION_KEY,
            getInitialValueInEffect: true,
        });
    return useQuery<ValidationResponse[], ApiError>({
        queryKey: 'validation',
        queryFn: () => getValidation(projectUuid),
        onSuccess: (data) => {
            const previousTimestamp = lastValidationNotification.split(';')[0];
            const currentTimestamp = data[0].createdAt.toString();
            const isSameAsPreviousTimestamp =
                previousTimestamp === currentTimestamp;

            if (isSameAsPreviousTimestamp) return;
            console.log('not the same timestamp', {
                previousTimestamp,
                currentTimestamp,
            });

            setLastValidationNotification(`${currentTimestamp};unread`);
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
    const { showError } = useErrorLogs();
    const { showToastSuccess } = useToaster();

    return useMutation<ApiJobScheduledResponse['results'], ApiError>({
        mutationKey: ['validation', projectUuid],
        mutationFn: () => updateValidation(projectUuid),
        onSuccess: (data) => {
            // Wait until validation is complete
            pollJobStatus(data.jobId)
                .then(() => {
                    onComplete();
                    // Invalidate validation to get latest results
                    queryClient.invalidateQueries({ queryKey: ['validation'] });
                    showToastSuccess({ title: 'Validation completed' });
                })
                .catch((error: Error) => {
                    showError({
                        title: 'Unable to update validation',
                        body: error.message,
                    });
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
        useLocalStorage({
            key: LAST_VALIDATION_NOTIFICATION_KEY,
            getInitialValueInEffect: true,
        });
    const [lastValidationTimestamp = '', lastValidationStatus = ''] =
        lastValidationNotification ? lastValidationNotification.split(';') : [];

    const hasReadLastValidationNotification =
        !!lastValidationNotification && lastValidationStatus === 'read';

    const setHasReadLastValidationNotification = () =>
        setLastValidationNotification(`${lastValidationTimestamp};read`);

    return [
        hasReadLastValidationNotification,
        setHasReadLastValidationNotification,
    ];
};
