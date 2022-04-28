import { IconName } from '@blueprintjs/core';
import { ApiError, ApiRefreshResults, Job } from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

export const refreshStatusInfo = (
    status: string,
): { title: string; icon: IconName; status: string } => {
    switch (status) {
        case 'DONE':
            return {
                title: 'Sync successful!',
                icon: 'tick-circle',
                status: 'Success',
            };
        case 'ERROR':
            return {
                title: 'Error in sync',
                icon: 'warning-sign',
                status: 'Error',
            };
        case 'RUNNING':
            return {
                title: 'Sync in progress',
                icon: 'refresh',
                status: 'In progress',
            };

        case 'PENDING':
            return {
                title: 'Sync in progress',
                icon: 'refresh',
                status: 'Queued',
            };

        default:
            return {
                title: 'Sync in progress',
                icon: 'refresh',
                status: 'Success',
            };
    }
};

export const runningStepsInfo = (steps: any[]) => {
    const runningStep = steps.find((step: any) => {
        return step.jobStatus === 'RUNNING';
    });
    const numberOfCompletedSteps = steps.filter((step: any) => {
        return step.stepStatus === 'DONE';
    }).length;
    const completedStepsMessage = `${numberOfCompletedSteps}/${steps.length}`;

    return { runningStep, numberOfCompletedSteps, completedStepsMessage };
};

export const TOAST_KEY_FOR_REFRESH_JOB = 'refresh-job';

const refresh = async (projectUuid: string) =>
    lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: `/projects/${projectUuid}/refresh`,
        body: undefined,
    });

const getJob = async (jobUuid: string) =>
    lightdashApi<Job>({
        method: 'GET',
        url: `/jobs/${jobUuid}`,
        body: undefined,
    });

export const useGetRefreshData = (jobId: string | undefined) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { showToastInfo, showToastSuccess, showToastError } = useApp();
    const setErrorResponse = useQueryError();
    return useQuery<Job, ApiError>({
        queryKey: ['refresh', projectUuid],
        queryFn: () => getJob(jobId || ''),
        enabled: jobId !== undefined,
        refetchInterval: (data) => data?.jobStatus === 'RUNNING' && 1000,
        onSuccess: async (data) => {
            const toastTitle = `${refreshStatusInfo(data?.jobStatus).title}`;
            const hasSteps = !!data.steps.length;
            switch (data.jobStatus) {
                case 'DONE':
                    showToastSuccess({
                        key: TOAST_KEY_FOR_REFRESH_JOB,
                        title: toastTitle,
                    });
                    break;
                case 'RUNNING':
                    showToastInfo({
                        key: TOAST_KEY_FOR_REFRESH_JOB,
                        title: toastTitle,
                        subtitle: hasSteps
                            ? `Steps ${
                                  runningStepsInfo(data?.steps)
                                      .completedStepsMessage
                              }: ${runningStepsInfo(data?.steps).runningStep}`
                            : '',
                        icon: `${refreshStatusInfo(data?.jobStatus).icon}`,
                        timeout: 0,
                        // TO BE UNCOMMENTED WHEN STEPS ARE IMPLEMENTED ON THE BE
                        // action: {
                        //     text: 'View log ',
                        //     icon: 'arrow-right',
                        //     onClick: () => setIsRefreshStepsOpen(true),
                        // },
                    });
                    break;
                case 'ERROR':
                    showToastError({
                        key: TOAST_KEY_FOR_REFRESH_JOB,
                        title: toastTitle,
                    });
            }
        },
        onError: (result) => setErrorResponse(result),
    });
};

export const useRefreshServer = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();

    return useMutation<ApiRefreshResults, ApiError>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: () => refresh(projectUuid),
        onSettled: async () =>
            queryClient.setQueryData(['status', projectUuid], 'loading'),
        onError: (result) => setErrorResponse(result),
    });
};
