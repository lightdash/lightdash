import {
    FeatureFlags,
    type ApiError,
    type EmailStatusExpiring,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

const getEmailStatusQuery = async (lightdashApi: LightdashApi) => {
    return lightdashApi<EmailStatusExpiring>({
        url: `/user/me/email/status`,
        method: 'GET',
        body: undefined,
    });
};

const sendOneTimePasscodeQuery = async (lightdashApi: LightdashApi) => {
    return lightdashApi<EmailStatusExpiring>({
        url: `/user/me/email/otp`,
        method: 'PUT',
        body: undefined,
    });
};

const verifyOTPQuery = async (lightdashApi: LightdashApi, code: string) => {
    return lightdashApi<EmailStatusExpiring>({
        url: `/user/me/email/status?passcode=${code}`,
        method: 'GET',
        body: undefined,
    });
};

export const useEmailStatus = (enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    return useQuery<EmailStatusExpiring, ApiError>({
        queryKey: ['email_status'],
        queryFn: () => getEmailStatusQuery(lightdashApi),
        enabled,
        // Prevent infinite loop on /verify-email page when session has issues
        // This query only needs to run once on mount - verification updates via
        // manual invalidation (useVerifyEmail onSuccess)
        refetchOnMount: false,
        refetchOnReconnect: false,
    });
};

export const useOneTimePassword = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<EmailStatusExpiring, ApiError>(
        () => sendOneTimePasscodeQuery(lightdashApi),
        {
            mutationKey: ['send_verification_email'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['email_status']);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `We couldn't send a verification e-mail to your inbox.`,
                    apiError: error,
                });
            },
        },
    );
};

export const useVerifyEmail = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const emailOnlySignupFlag = useServerFeatureFlag(
        FeatureFlags.NewOnboarding,
    );
    return useMutation<EmailStatusExpiring, ApiError, string>(
        (code) => verifyOTPQuery(lightdashApi, code),
        {
            mutationKey: ['verify_one_time_password'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['email_status']);

                if (
                    data.isVerified &&
                    !(emailOnlySignupFlag.data?.enabled ?? false)
                )
                    showToastSuccess({
                        title: 'Success! Your e-mail has been verified.',
                    });
            },
        },
    );
};
