import {
    ApiError,
    ApiSchedulerLogsResponse,
    SchedulerAndTargets,
    SchedulerLog,
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
    lightdashApi<SchedulerLog[]>({
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
    useQuery<SchedulerLog[], ApiError>({
        queryKey: ['schedulerLogs', projectUuid],
        queryFn: () => getSchedulerLogs(projectUuid),
    });
