import {
    FilterOperator,
    type Dashboard,
    type DashboardFilters,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppProvider from '../../../../../providers/App/AppProvider';
import DashboardProvider from '../../../../../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import { mockedLightdashApi } from '../../../../../testing/mockedLightdashApi';
import { store as aiAgentStore } from '../../../aiCopilot/store';
import { setCurrentDashboard } from '../../../aiCopilot/store/aiAgentLauncherSlice';
import { EmbedDashboardAiAgentContextPublisher } from './EmbedDashboardAiAgentContextPublisher';

vi.mock('../../../../../api');

const projectUuid = '9a0b7a3c-0000-4000-8000-000000000001';
const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};
const dashboard = {
    uuid: 'dashboard-uuid',
    projectUuid,
    slug: 'orders-dashboard',
    name: 'Orders dashboard',
    tabs: [],
    tiles: [],
    filters: emptyFilters,
    parameters: {},
} as unknown as Dashboard;

const storeFilter: DashboardFilters = {
    ...emptyFilters,
    dimensions: [
        {
            id: 'filter-store',
            label: undefined,
            target: { fieldId: 'orders_store', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: ['Lisbon'],
        },
    ],
};

const getCurrentDashboard = () =>
    aiAgentStore.getState().aiAgentLauncher.currentDashboard;

const renderPublisher = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const Wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>
            <AppProvider>
                <MemoryRouter>
                    <DashboardProvider
                        embedToken="token"
                        projectUuid={projectUuid}
                    >
                        <EmbedDashboardAiAgentContextPublisher />
                        {children}
                    </DashboardProvider>
                </MemoryRouter>
            </AppProvider>
        </QueryClientProvider>
    );
    return renderHook(
        () => ({
            setEmbedDashboard: useDashboardContext((c) => c.setEmbedDashboard),
            setDashboardTemporaryFilters: useDashboardContext(
                (c) => c.setDashboardTemporaryFilters,
            ),
            setDashboardFilters: useDashboardContext(
                (c) => c.setDashboardFilters,
            ),
        }),
        { wrapper: Wrapper },
    );
};

beforeEach(() => {
    mockedLightdashApi.mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
    aiAgentStore.dispatch(setCurrentDashboard(null));
});

describe('EmbedDashboardAiAgentContextPublisher', () => {
    it('publishes the on-screen filters for an embedded agent', async () => {
        const { result } = renderPublisher();
        act(() => result.current.setEmbedDashboard(dashboard));

        await waitFor(() =>
            expect(getCurrentDashboard()).toEqual({
                projectUuid,
                uuid: dashboard.uuid,
                name: dashboard.name,
                activeTabUuid: null,
                runtimeOverrides: null,
            }),
        );

        act(() => result.current.setDashboardTemporaryFilters(storeFilter));

        await waitFor(() =>
            expect(
                getCurrentDashboard()?.runtimeOverrides?.dashboardFilters
                    ?.dimensions,
            ).toEqual([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'orders_store',
                    }),
                    values: ['Lisbon'],
                }),
            ]),
        );
    });

    it('clears the published dashboard on unmount', async () => {
        const { result, unmount } = renderPublisher();
        act(() => result.current.setEmbedDashboard(dashboard));
        await waitFor(() => expect(getCurrentDashboard()).not.toBeNull());

        unmount();

        expect(getCurrentDashboard()).toBeNull();
    });

    it('does not clear a dashboard published by another embed', async () => {
        const { result, unmount } = renderPublisher();
        act(() => result.current.setEmbedDashboard(dashboard));
        await waitFor(() => expect(getCurrentDashboard()).not.toBeNull());
        const other = {
            projectUuid,
            uuid: 'other-dashboard',
            name: 'Other',
            activeTabUuid: null,
            runtimeOverrides: null,
        };
        act(() => {
            aiAgentStore.dispatch(setCurrentDashboard(other));
        });

        unmount();

        expect(getCurrentDashboard()).toEqual(other);
    });

    it('publishes unsaved filter edits', async () => {
        const { result } = renderPublisher();
        act(() => result.current.setEmbedDashboard(dashboard));
        await waitFor(() => expect(getCurrentDashboard()).not.toBeNull());

        act(() => result.current.setDashboardFilters(storeFilter));

        await waitFor(() =>
            expect(
                getCurrentDashboard()?.runtimeOverrides?.dashboardFilters
                    ?.dimensions,
            ).toEqual([expect.objectContaining({ values: ['Lisbon'] })]),
        );
    });
});
