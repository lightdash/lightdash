import {
    type ApiError,
    type LightdashUser,
    type LoginOptions,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useQueryError from '../../../hooks/useQueryError';

export type LoginParams = { email: string; password: string };

const fetchLoginOptions = async (email?: string) =>
    lightdashApi<LoginOptions>({
        url: `/user/login-options${
            email ? `?email=${encodeURIComponent(email)}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const useFetchLoginOptions = ({
    email,
    useQueryOptions,
}: {
    email?: string;
    useQueryOptions?: UseQueryOptions<LoginOptions, ApiError>;
}) => {
    const setErrorResponse = useQueryError();
    return useQuery<LoginOptions, ApiError>({
        queryKey: ['loginOptions', email],
        queryFn: () => fetchLoginOptions(email),
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

const loginQuery = async (data: LoginParams) =>
    lightdashApi<LightdashUser>({
        url: `/login`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useLoginWithEmailMutation = ({
    onSuccess,
    onError,
}: {
    onSuccess: (user: LightdashUser) => void;
    onError: (error: ApiError) => void;
}) =>
    useMutation<LightdashUser, ApiError, LoginParams>(loginQuery, {
        mutationKey: ['login'],
        onSuccess: onSuccess,
        onError: onError,
    });
