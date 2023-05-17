import {
    ApiError,
    ApiJobStatusResponse,
    SchedulerAndTargets,
    SchedulerJobStatus,
    SchedulerWithLogs,
} from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getScheduler = async (uuid: string) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/schedulers/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const getSchedulerLogs = async (projectUuid: string) =>
    lightdashApi<SchedulerWithLogs>({
        url: `/schedulers/${projectUuid}/logs`,
        method: 'GET',
        body: undefined,
    });

export const useScheduler = (uuid: string) =>
    useQuery<SchedulerAndTargets, ApiError>({
        queryKey: ['scheduler', uuid],
        queryFn: () => getScheduler(uuid),
    });

export const useSchedulerLogs = (projectUuid: string) =>
    useQuery<SchedulerWithLogs, ApiError>({
        queryKey: ['schedulerLogs', projectUuid],
        queryFn: () => getSchedulerLogs(projectUuid),
    });

const getJobStatus = async (
    jobId: string,
    onComplete: () => void,
    onError: (error: Error) => void,
) => {
    lightdashApi<ApiJobStatusResponse['results']>({
        url: `/schedulers/job/${jobId}/status`,
        method: 'GET',
        body: undefined,
    })
        .then((data) => {
            if (data.status === SchedulerJobStatus.COMPLETED) {
                return onComplete();
            } else {
                setTimeout(
                    () => getJobStatus(jobId, onComplete, onError),
                    2000,
                );
            }
        })
        .catch((error) => {
            return onError(error);
        });
};

export const pollJobStatus = async (jobId: string) => {
    return new Promise<void>((resolve, reject) => {
        getJobStatus(
            jobId,
            () => resolve(),
            (error) => reject(error),
        );
    });
};
