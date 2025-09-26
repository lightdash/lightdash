import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { type FC, type PropsWithChildren } from 'react';
import { createQueryClient } from './createQueryClient';

const ReactQueryProvider: FC<PropsWithChildren> = ({ children }) => {
    const queryClient = createQueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            {import.meta.env.DEV && REACT_QUERY_DEVTOOLS_ENABLED && (
                <ReactQueryDevtools initialIsOpen={false} />
            )}
        </QueryClientProvider>
    );
};

export default ReactQueryProvider;
