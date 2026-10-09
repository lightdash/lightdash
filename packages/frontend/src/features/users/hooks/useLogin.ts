import {
    InvalidUser,
    type ApiError,
    type LightdashUser,
    type LoginOptions,
    type MobileLoginIntent,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import useQueryError from '../../../hooks/useQueryError';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export type LoginParams = { email: string; password: string };

const fetchLoginOptions = async (
    lightdashApi: LightdashApi,
    email?: string,
    mobileLoginIntent?: MobileLoginIntent,
) => {
    const queryParams = new URLSearchParams();
    if (email) {
        queryParams.set('email', email);
    }
    if (mobileLoginIntent) {
        queryParams.set('mobile_login_intent', mobileLoginIntent);
    }
    const query = queryParams.toString();

    return lightdashApi<LoginOptions>({
        url: `/user/login-options${query ? `?${query}` : ''}`,
        method: 'GET',
        body: undefined,
    });
};

export const useFetchLoginOptions = ({
    email,
    mobileLoginIntent,
    useQueryOptions,
}: {
    email?: string;
    mobileLoginIntent?: MobileLoginIntent;
    useQueryOptions?: UseQueryOptions<LoginOptions, ApiError>;
}) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    const { showToastError } = useToaster();

    return useQuery<LoginOptions, ApiError>({
        queryKey: ['loginOptions', email, mobileLoginIntent],
        queryFn: () =>
            fetchLoginOptions(lightdashApi, email, mobileLoginIntent),
        retry: false,
        onError: (result) => {
            setErrorResponse(result);
            if (
                result.error.name === InvalidUser.name &&
                window.location.pathname === '/login'
            ) {
                showToastError({
                    title: 'Your login has expired',
                    subtitle: 'Please log in again to continue.',
                });
            }
        },
        ...useQueryOptions,
    });
};

const loginQuery = async (lightdashApi: LightdashApi, data: LoginParams) =>
    lightdashApi<LightdashUser>({
        url: `/login`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
    });

export const useLoginWithEmailMutation = ({
    onSuccess,
    onError,
}: {
    onSuccess: (user: LightdashUser) => void;
    onError: (error: ApiError) => void;
}) => {
    const lightdashApi = useLightdashApi();
    return useMutation<LightdashUser, ApiError, LoginParams>(
        (data: LoginParams) => loginQuery(lightdashApi, data),
        {
            mutationKey: ['login'],
            onSuccess: onSuccess,
            onError: onError,
        },
    );
};

const emailOtpRequestQuery = async (
    lightdashApi: LightdashApi,
    email: string,
) =>
    lightdashApi<null>({
        url: `/user/login-email-otp`,
        method: 'POST',
        body: JSON.stringify({ email }),
    });

export const useEmailOtpRequestMutation = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<null, ApiError, string>(
        (email) => emailOtpRequestQuery(lightdashApi, email),
        {
            mutationKey: ['login-email-otp-request'],
        },
    );
};

export type EmailOtpVerifyParams = { email: string; passcode: string };

const emailOtpVerifyQuery = async (
    lightdashApi: LightdashApi,
    data: EmailOtpVerifyParams,
) =>
    lightdashApi<LightdashUser>({
        url: `/user/login-email-otp/verify`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useEmailOtpVerifyMutation = ({
    onSuccess,
    onError,
}: {
    onSuccess: (user: LightdashUser) => void;
    onError: (error: ApiError) => void;
}) => {
    const lightdashApi = useLightdashApi();
    return useMutation<LightdashUser, ApiError, EmailOtpVerifyParams>(
        (data: EmailOtpVerifyParams) => emailOtpVerifyQuery(lightdashApi, data),
        {
            mutationKey: ['login-email-otp-verify'],
            onSuccess,
            onError,
        },
    );
};
