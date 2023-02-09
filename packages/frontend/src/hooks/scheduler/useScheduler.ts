import { ApiError, SchedulerAndTargets } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getScheduler = async (uuid: string) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/schedulers/${uuid}`,
        method: 'GET',
        body: undefined,
    });

export const useScheduler = (uuid: string) =>
    useQuery<SchedulerAndTargets, ApiError>({
        queryKey: ['scheduler', uuid],
        queryFn: () => getScheduler(uuid),
    });
