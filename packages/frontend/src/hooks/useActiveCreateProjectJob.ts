import {
    type ApiError,
    type ApiErrorDetail,
    type Job,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const ACTIVE_CREATE_PROJECT_JOB_KEY = ['jobs', 'create-project', 'active'];

const getActiveCreateProjectJob = async (lightdashApi: LightdashApi) =>
    lightdashApi<Job | null>({
        method: 'GET',
        url: '/org/jobs/create-project/active',
        body: undefined,
    });

export const useActiveCreateProjectJob = (enabled: boolean = true) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Job | null, ApiError>({
        queryKey: ACTIVE_CREATE_PROJECT_JOB_KEY,
        queryFn: () => getActiveCreateProjectJob(lightdashApi),
        enabled,
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
};

export const getInFlightJobUuidFromError = (
    error: ApiErrorDetail,
): string | undefined => {
    if (error.statusCode !== 409) {
        return undefined;
    }
    const jobUuid = error.data?.jobUuid;
    return typeof jobUuid === 'string' && jobUuid.length > 0
        ? jobUuid
        : undefined;
};
