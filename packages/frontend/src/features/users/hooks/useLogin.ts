import {
    type ApiError,
    type ApiGetLoginOptionsResponse,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useQueryError from '../../../hooks/useQueryError';

const fetchLoginOptions = async (email: string) =>
    lightdashApi<ApiGetLoginOptionsResponse>({
        url: `/login-options?email=${encodeURIComponent(email)}`,
        method: 'GET',
        body: undefined,
    });

export const useFetchLoginOptions = ({
    email,
    useQueryOptions,
}: {
    email: string;
    useQueryOptions?: UseQueryOptions<ApiGetLoginOptionsResponse, ApiError>;
}) => {
    const setErrorResponse = useQueryError();
    return useQuery<ApiGetLoginOptionsResponse, ApiError>({
        queryKey: ['loginOptions', email],
        queryFn: () => fetchLoginOptions(email),
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};
