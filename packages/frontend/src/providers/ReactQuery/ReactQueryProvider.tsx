import { QueryClientProvider } from '@tanstack/react-query';
import { useRef, useState, type FC, type PropsWithChildren } from 'react';
import {
    createQueryClient,
    type QueryClientErrorHandler,
} from './createQueryClient';

const ReactQueryProvider: FC<
    PropsWithChildren<{ onError?: QueryClientErrorHandler }>
> = ({ children, onError }) => {
    // The client is created once, so it reads the latest handler from a ref
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    const [queryClient] = useState(() =>
        createQueryClient(undefined, (error, key) =>
            onErrorRef.current?.(error, key),
        ),
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

export default ReactQueryProvider;
