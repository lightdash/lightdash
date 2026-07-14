import {
    type ApiError,
    type OnboardingConnectionValidationResult,
    type ValidateOnboardingConnectionRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const validateConnection = (
    projectUuid: string,
    body: ValidateOnboardingConnectionRequest,
): Promise<OnboardingConnectionValidationResult> =>
    lightdashApi<OnboardingConnectionValidationResult>({
        url: `/projects/${projectUuid}/onboarding/connection/validate`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useValidateConnection = (projectUuid: string | null) =>
    useMutation<
        OnboardingConnectionValidationResult,
        ApiError,
        ValidateOnboardingConnectionRequest
    >({
        mutationKey: ['onboarding', 'connection', 'validate'],
        mutationFn: (body) => validateConnection(projectUuid ?? '', body),
    });
