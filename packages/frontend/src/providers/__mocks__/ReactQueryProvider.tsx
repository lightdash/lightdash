import { QueryClientProvider } from '@tanstack/react-query';
import { type FC, type PropsWithChildren } from 'react';
import { createQueryClient } from '../ReactQueryProvider';

const ReactQueryProvider: FC<PropsWithChildren> = ({ children }) => {
    const queryClient = createQueryClient({
        queries: {
            retry: false,
        },
        mutations: {
            retry: false,
        },
    });

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

export default ReactQueryProvider;
