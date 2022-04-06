import { ApiError, OnboardingStatus, ProjectSavedChartStatus } from 'common';
import { useMutation, useQuery } from 'react-query';
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

const setOnboardingShownSuccess = async () =>
    lightdashApi<undefined>({
        url: `/org/onboardingStatus/shownSuccess`,
        method: 'POST',
        body: undefined,
    });

export const useOnboardingShownSuccess = () =>
    useMutation<void, ApiError, void>(setOnboardingShownSuccess, {
        mutationKey: ['onboarding_shown_success'],
    });

const getProjectSavedChartStatus = async (projectUuid: string) =>
    lightdashApi<ProjectSavedChartStatus>({
        url: `/project/${projectUuid}/hasSavedCharts`,
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
