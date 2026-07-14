import {
    type ApiError,
    type ConfigureOnboardingConnectionRequest,
    type OnboardingConnectionDepositResult,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const configureConnection = (
    projectUuid: string,
    body: ConfigureOnboardingConnectionRequest,
): Promise<OnboardingConnectionDepositResult> =>
    lightdashApi<OnboardingConnectionDepositResult>({
        url: `/projects/${projectUuid}/onboarding/connection/configure`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useConfigureConnection = (projectUuid: string | null) =>
    useMutation<
        OnboardingConnectionDepositResult,
        ApiError,
        ConfigureOnboardingConnectionRequest
    >({
        mutationKey: ['onboarding', 'connection', 'configure'],
        mutationFn: (body) => configureConnection(projectUuid ?? '', body),
    });
