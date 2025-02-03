import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

export const createQueryClient = (options?: DefaultOptions) => {
    console.log('using overrides');
    console.log(options);

    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                staleTime: 30000, // 30 seconds
                refetchOnWindowFocus: false,
                onError: async (result) => {
                    console.log('alalalala');
                    // @ts-ignore
                    const { error: { statusCode } = {} } = result;
                    if (statusCode === 401) {
                        await queryClient.invalidateQueries(['health']);
                    }
                },
                ...options?.queries,
            },
            mutations: {
                ...options?.mutations,
            },
        },
    });

    return queryClient;
};
