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

export const useJob = (jobId: string | undefined) => {
    return useQuery<Job, ApiError>({
        queryKey: ['job', jobId],
        queryFn: () => getJob(jobId || ''),
        enabled: !!jobId,
        refetchInterval: (data) => data?.jobStatus === 'RUNNING' && 500,
        onSuccess: (data) => {
            if (data.jobStatus === 'DONE' || data.jobStatus === 'ERROR') {
                jobId = undefined;
            }
        },
        onError: (result) => result,
    });
};

export const useRefreshServer = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();
    const { setActiveJobId } = useApp();
    return useMutation<ApiRefreshResults, ApiError>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: () => refresh(projectUuid),
        onSettled: async () =>
            queryClient.setQueryData(['status', projectUuid], 'loading'),
        onSuccess: (data) => setActiveJobId(data.jobUuid),
        onError: (result) => setErrorResponse(result),
    });
};
