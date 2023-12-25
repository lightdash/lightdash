import {
    ApiError,
    OnboardingStatus,
    ProjectSavedChartStatus,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getOnboardingStatus = async () =>
    lightdashApi<OnboardingStatus>({
        url: `/org/onboardingStatus`,
        method: 'GET',
        body: undefined,
    });

export const useOnboardingStatus = () =>
    useQuery<OnboardingStatus, ApiError>({
        queryKey: ['onboarding-status'],
        queryFn: getOnboardingStatus,
        retry: false,
        refetchOnMount: true,
    });

const getProjectSavedChartStatus = async (projectUuid: string) =>
    lightdashApi<ProjectSavedChartStatus>({
        url: `/projects/${projectUuid}/hasSavedCharts`,
        method: 'GET',
        body: undefined,
    });

export const useProjectSavedChartStatus = (projectUuid: string) =>
    useQuery<ProjectSavedChartStatus, ApiError>({
        queryKey: [projectUuid, 'project-saved-chart-status'],
        queryFn: () => getProjectSavedChartStatus(projectUuid),
        retry: false,
        refetchOnMount: true,
    });
