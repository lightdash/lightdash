import {
    type ApiError,
    type OnboardingProjectState,
    type OnboardingStepType,
    type UpdateOnboardingProjectStep,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getOnboardingState = async (
    projectUuid: string,
): Promise<OnboardingProjectState> =>
    lightdashApi<OnboardingProjectState>({
        url: `/projects/${projectUuid}/onboarding/state`,
        method: 'GET',
        body: undefined,
    });

export const patchOnboardingState = async (
    projectUuid: string,
    body: UpdateOnboardingProjectStep,
): Promise<OnboardingProjectState> =>
    lightdashApi<OnboardingProjectState>({
        url: `/projects/${projectUuid}/onboarding/state`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

const getOnboardingStateQueryKey = (projectUuid: string | undefined) => [
    'onboarding',
    'state',
    projectUuid,
];

type UseOnboardingStateOptions = {
    projectUuid: string | undefined;
    poll?: boolean;
    options?: UseQueryOptions<OnboardingProjectState, ApiError>;
};

export const useOnboardingState = ({
    projectUuid,
    poll = false,
    options,
}: UseOnboardingStateOptions) =>
    useQuery<OnboardingProjectState, ApiError>({
        queryKey: getOnboardingStateQueryKey(projectUuid),
        queryFn: () => getOnboardingState(projectUuid ?? ''),
        enabled: !!projectUuid,
        refetchInterval: poll ? 800 : false,
        ...options,
    });

export const findStep = (
    state: OnboardingProjectState | undefined,
    step: OnboardingStepType,
) => state?.steps.find((s) => s.step === step) ?? null;
