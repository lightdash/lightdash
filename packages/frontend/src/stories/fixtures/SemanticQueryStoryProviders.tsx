import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC, type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import TrackingProvider from '../../providers/Tracking/TrackingProvider';
import AppProviderMock from '../../testing/__mocks__/providers/AppProvider.mock';
import { ordersExplore, STORY_PROJECT_UUID } from './semanticQueryStoryData';

const createStoryQueryClient = () => {
    const client = createQueryClient({
        queries: {
            retry: false,
            staleTime: Infinity,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
        },
    });
    client.setQueryData(
        ['tables', 'orders', STORY_PROJECT_UUID],
        ordersExplore,
    );
    return client;
};

/** Query cache with the orders explore, router, app and tracking context. */
const SemanticQueryStoryProviders: FC<PropsWithChildren> = ({ children }) => {
    const [client] = useState(createStoryQueryClient);
    return (
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <AppProviderMock>
                    <TrackingProvider>{children}</TrackingProvider>
                </AppProviderMock>
            </MemoryRouter>
        </QueryClientProvider>
    );
};

export default SemanticQueryStoryProviders;
