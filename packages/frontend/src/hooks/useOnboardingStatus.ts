import {
    type ApiError,
    type OnboardingStatus,
    type ProjectSavedChartStatus,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const getOnboardingStatus = async (lightdashApi: LightdashApi) =>
    lightdashApi<OnboardingStatus>({
        url: `/org/onboardingStatus`,
        method: 'GET',
        body: undefined,
    });

export const useOnboardingStatus = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<OnboardingStatus, ApiError>({
        queryKey: ['onboarding-status'],
        queryFn: () => getOnboardingStatus(lightdashApi),
        retry: false,
        refetchOnMount: true,
    });
};

const getProjectSavedChartStatus = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ProjectSavedChartStatus>({
        url: `/projects/${projectUuid}/hasSavedCharts`,
        method: 'GET',
        body: undefined,
    });

export const useProjectSavedChartStatus = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ProjectSavedChartStatus, ApiError>({
        queryKey: [projectUuid, 'project-saved-chart-status'],
        queryFn: () => getProjectSavedChartStatus(lightdashApi, projectUuid!),
        retry: false,
        refetchOnMount: true,
        enabled: !!projectUuid,
    });
};
