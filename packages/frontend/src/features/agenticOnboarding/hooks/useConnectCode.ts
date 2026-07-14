import {
    type ApiError,
    type OnboardingConnectCodeResult,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const mintConnectCode = async (
    projectUuid: string,
): Promise<OnboardingConnectCodeResult> =>
    lightdashApi<OnboardingConnectCodeResult>({
        url: `/projects/${projectUuid}/onboarding/connect-code`,
        method: 'POST',
        body: undefined,
    });

export const useConnectCode = () =>
    useMutation<OnboardingConnectCodeResult, ApiError, string>({
        mutationKey: ['onboarding', 'connect-code'],
        mutationFn: mintConnectCode,
    });
