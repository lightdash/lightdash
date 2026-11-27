import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC, type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import SchedulersTable from '../components/SchedulersView/SchedulersTable';
import { LightdashApiContext } from '../providers/LightdashApi/LightdashApiContext';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';
import AppProviderMock from '../testing/__mocks__/providers/AppProvider.mock';
import { projectUuid, schedulerStoryApi } from './fixtures/scheduledDeliveries';

const StoryProviders: FC<PropsWithChildren> = ({ children }) => {
    const [client] = useState(() =>
        createQueryClient({ queries: { retry: false, staleTime: Infinity } }),
    );
    return (
        <MemoryRouter>
            <LightdashApiContext.Provider value={schedulerStoryApi}>
                <QueryClientProvider client={client}>
                    <AppProviderMock
                        mocks={{ health: { hasEmailClient: true } }}
                    >
                        {children}
                    </AppProviderMock>
                </QueryClientProvider>
            </LightdashApiContext.Provider>
        </MemoryRouter>
    );
};

const meta = {
    title: 'Scheduled Deliveries/Table',
    component: SchedulersTable,
    args: {
        projectUuid,
        getSlackChannelName: (id) =>
            id === 'sales-team' ? 'sales-team' : null,
    },
    decorators: [
        (Story) => (
            <StoryProviders>
                <Story />
            </StoryProviders>
        ),
    ],
} satisfies Meta<typeof SchedulersTable>;

export default meta;
export const AllDeliveries: StoryObj<typeof meta> = {};
