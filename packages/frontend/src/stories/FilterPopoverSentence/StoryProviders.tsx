import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC, type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { action } from 'storybook/actions';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import DashboardContext from '../../providers/Dashboard/context';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import { LightdashApiContext } from '../../providers/LightdashApi/LightdashApiContext';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import TrackingContext from '../../providers/Tracking/context';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import {
    DASHBOARD_UUID,
    dashboardFilters,
    itemsMap,
    PROJECT_UUID,
    sections,
    storyLightdashApi,
    tabs,
} from './fixtures';

// Only what the Settings view's shipped `ViewerControls` and
// `RequiredFilterCard` read from the dashboard
const dashboardContext = {
    dashboard: {
        uuid: DASHBOARD_UUID,
        filters: dashboardFilters,
    },
    allFilterableFieldsMap: itemsMap,
    allFilterableMetricsMap: {},
    filterableFieldsByTileUuid: undefined,
    updateDimensionDashboardFilter: action('updateDimensionDashboardFilter'),
    updateMetricDashboardFilter: action('updateMetricDashboardFilter'),
} as unknown as DashboardContextType;

const tracking = {
    data: {},
    track: action('track'),
    page: action('page'),
    identify: action('identify'),
};

const createStore = () =>
    seedDashboardEditState(
        createDashboardTestStore({ dashboardFilters, isEditMode: true }),
        {
            dashboard: {
                config: {
                    controlSections: sections,
                    isDateZoomDisabled: false,
                },
            },
            dashboardTabs: tabs,
            activeTab: tabs[0],
        },
    );

// Everything the shipped pickers and settings need, answered offline
export const FilterPopoverStoryProviders: FC<PropsWithChildren> = ({
    children,
}) => {
    const [queryClient] = useState(() =>
        createQueryClient({ queries: { retry: false } }),
    );
    const [store] = useState(createStore);
    return (
        <MemoryRouter>
            <QueryClientProvider client={queryClient}>
                <LightdashApiContext.Provider value={storyLightdashApi}>
                    <TrackingContext.Provider value={tracking}>
                        <DashboardContext.Provider value={dashboardContext}>
                            <DashboardStoreTestProvider store={store}>
                                <FiltersProvider
                                    projectUuid={PROJECT_UUID}
                                    itemsMap={itemsMap}
                                    dashboardFilters={dashboardFilters}
                                >
                                    {children}
                                </FiltersProvider>
                            </DashboardStoreTestProvider>
                        </DashboardContext.Provider>
                    </TrackingContext.Provider>
                </LightdashApiContext.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    );
};
