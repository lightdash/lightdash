import {
    DefaultOptions,
    QueryClient,
    QueryClientProvider,
} from '@tanstack/react-query';
import { FC, PropsWithChildren } from 'react';

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

type Props = {
    queryClient: QueryClient;
};

const ReactQueryProvider: FC<PropsWithChildren<Props>> = ({
    children,
    queryClient,
}) => {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

export default ReactQueryProvider;
