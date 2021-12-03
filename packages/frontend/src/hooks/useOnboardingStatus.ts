import { ApiError, OnboardingStatus } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getOnboardingStatus = async () =>
    lightdashApi<OnboardingStatus>({
        url: `/org/onboardingStatus`,
        method: 'GET',
        body: undefined,
    });

export const useOnboardingStatus = () =>
    useQuery<OnboardingStatus, ApiError>({
        queryKey: ['onboardingStatus'],
        queryFn: getOnboardingStatus,
        retry: false,
        refetchOnMount: true,
    });
