import {
    QueryClient,
    QueryClientProvider,
    type DefaultOptions,
} from '@tanstack/react-query';
import { type FC, type PropsWithChildren } from 'react';

// used in test mocks
// ts-unused-exports:disable-next-line
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
                ...options?.queries,
            },
            mutations: {
                ...options?.mutations,
            },
        },
    });

    return queryClient;
};

const ReactQueryProvider: FC<PropsWithChildren> = ({ children }) => {
    const queryClient = createQueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

export default ReactQueryProvider;
