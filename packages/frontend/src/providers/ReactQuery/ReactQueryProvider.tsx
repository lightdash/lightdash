import {
    QueryClientProvider,
    type DefaultOptions,
} from '@tanstack/react-query';
import { type FC, type PropsWithChildren } from 'react';
import { createQueryClient } from './createQueryClient';

type Props = {
    queryClientOverride?: DefaultOptions;
};

const ReactQueryProvider: FC<PropsWithChildren<Props>> = ({
    children,
    queryClientOverride,
}) => {
    const queryClient = createQueryClient(queryClientOverride);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

export default ReactQueryProvider;
