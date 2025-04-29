import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

export const createQueryClient = (options?: DefaultOptions) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                staleTime: 30000, // 30 seconds
                refetchOnWindowFocus: false,
                onError: async (result) => {
                    // @ts-ignore
                    const { error: { statusCode } = {} } = result;
                    if (statusCode === 401) {
                        await queryClient.invalidateQueries(['health']);
                    }
                },
                networkMode: 'always',
                ...options?.queries,
            },
            mutations: {
                networkMode: 'always',
                ...options?.mutations,
            },
        },
    });

    return queryClient;
};
