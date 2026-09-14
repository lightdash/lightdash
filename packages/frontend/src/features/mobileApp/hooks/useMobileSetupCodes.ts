import {
    MobileSetupCodeStatus,
    type ApiError,
    type MobileSetupCode,
    type MobileSetupCodeStatusResponse,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const MOBILE_SETUP_CODE_QUERY_KEY = 'mobile-setup-code';

const STATUS_POLL_INTERVAL_MS = 3000;

const mintMobileSetupCode = async (projectUuid: string) =>
    lightdashApi<MobileSetupCode>({
        url: '/user/me/mobile-setup-codes',
        method: 'POST',
        body: JSON.stringify({ projectUuid }),
        sensitive: true,
    });

const getMobileSetupCodeStatus = async (codeId: string) =>
    lightdashApi<MobileSetupCodeStatusResponse>({
        url: `/user/me/mobile-setup-codes/${codeId}`,
        method: 'GET',
        body: undefined,
    });

const revokeMobileSetupCode = async (codeId: string) =>
    lightdashApi<null>({
        url: `/user/me/mobile-setup-codes/${codeId}`,
        method: 'DELETE',
        body: undefined,
    });

export const useMintMobileSetupCode = () => {
    const { showToastApiError } = useToaster();

    return useMutation<MobileSetupCode, ApiError, string>(
        (projectUuid) => mintMobileSetupCode(projectUuid),
        {
            mutationKey: [MOBILE_SETUP_CODE_QUERY_KEY, 'mint'],
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create a setup code',
                    apiError: error,
                });
            },
        },
    );
};

/**
 * Polls one setup code while it is still pending. `poll` is the caller's
 * document-visibility gate; a settled code stops the interval on its own.
 */
export const useMobileSetupCodeStatus = (
    codeId: string | undefined,
    { poll }: { poll: boolean },
) =>
    useQuery<MobileSetupCodeStatusResponse, ApiError>({
        queryKey: [MOBILE_SETUP_CODE_QUERY_KEY, 'status', codeId],
        queryFn: () => getMobileSetupCodeStatus(codeId!),
        enabled: !!codeId,
        refetchInterval: (data) =>
            poll && data?.status === MobileSetupCodeStatus.PENDING
                ? STATUS_POLL_INTERVAL_MS
                : false,
        refetchIntervalInBackground: false,
        retry: false,
    });

export const useRevokeMobileSetupCode = () =>
    useMutation<null, ApiError, string>(
        (codeId) => revokeMobileSetupCode(codeId),
        {
            mutationKey: [MOBILE_SETUP_CODE_QUERY_KEY, 'revoke'],
        },
    );
