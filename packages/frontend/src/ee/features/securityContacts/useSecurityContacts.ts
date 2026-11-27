import {
    isApiError,
    SecurityContactsResultsSchema,
    type ApiError,
    type SecurityContactsResults,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const QUERY_KEY = ['security-contacts'];
const URL = '/org/security-contacts';

export function useSecurityContacts() {
    const lightdashApi = useLightdashApi();
    const { data, isInitialLoading, error } = useQuery<
        SecurityContactsResults,
        ApiError
    >({
        queryKey: QUERY_KEY,
        queryFn: async () =>
            SecurityContactsResultsSchema.parse(
                await lightdashApi<SecurityContactsResults>({
                    url: URL,
                    method: 'GET',
                    body: undefined,
                    version: 'v1',
                }),
            ),
        retry: false,
        refetchOnWindowFocus: false,
    });

    return {
        emails: data?.emails,
        isLoading: isInitialLoading,
        // No customer record carries this instance's license yet.
        isNotConfigured: isApiError(error) && error.error.statusCode === 404,
    };
}

export function useUpdateSecurityContacts() {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<SecurityContactsResults, ApiError, string[]>({
        mutationFn: async (emails) =>
            SecurityContactsResultsSchema.parse(
                await lightdashApi<SecurityContactsResults>({
                    url: URL,
                    method: 'PUT',
                    body: JSON.stringify({ emails }),
                    version: 'v1',
                }),
            ),
        onSuccess: (results) => {
            queryClient.setQueryData(QUERY_KEY, results);
            showToastSuccess({ title: 'Security contacts saved' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not save security contacts',
                apiError: error,
            });
        },
    });
}
