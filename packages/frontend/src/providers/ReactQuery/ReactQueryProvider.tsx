import { QueryClientProvider } from '@tanstack/react-query';
import { type FC, type PropsWithChildren } from 'react';
import { createQueryClient } from './createQueryClient';

const ReactQueryProvider: FC<PropsWithChildren> = ({ children }) => {
    const queryClient = createQueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

export default ReactQueryProvider;
