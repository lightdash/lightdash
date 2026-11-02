import { type DashboardControlSection, type WeekDay } from '@lightdash/common';
import { Box } from '@mantine/core';
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
    availableTileFilters,
    DASHBOARD_UUID,
    dashboardFilters,
    itemsMap,
    parameterValues,
    PROJECT_UUID,
    storyLightdashApi,
    tabs,
    tiles,
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
    // Which tabs a filter reaches, for the move buttons' hidden-on-tab check
    filterableFieldsByTileUuid: availableTileFilters,
    updateDimensionDashboardFilter: action('updateDimensionDashboardFilter'),
    updateMetricDashboardFilter: action('updateMetricDashboardFilter'),
} as unknown as DashboardContextType;

const tracking = {
    data: {},
    track: action('track'),
    page: action('page'),
    identify: action('identify'),
};

const createStore = (sections: DashboardControlSection[]) =>
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
            dashboardTiles: tiles,
            activeTab: tabs[0],
        },
    );

type FrameProps = PropsWithChildren<{
    /** The project's week start; null for the date pickers' default. */
    startOfWeek: WeekDay | null;
    /** The dashboard's control sections. */
    sections: DashboardControlSection[];
}>;

// Everything the shipped pickers and settings need, answered offline, fed
// as the shipped editor's `FilterSettings` feeds `FiltersProvider`
const DashboardControlsProviders: FC<FrameProps> = ({
    startOfWeek,
    sections,
    children,
}) => {
    const [queryClient] = useState(() =>
        createQueryClient({ queries: { retry: false } }),
    );
    const [store] = useState(() => createStore(sections));
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
                                    startOfWeek={startOfWeek ?? undefined}
                                    dashboardFilters={dashboardFilters}
                                    dashboardTiles={tiles}
                                    filterableFieldsByTileUuid={
                                        availableTileFilters
                                    }
                                    activeTabUuid={tabs[0]?.uuid}
                                    parameterValues={parameterValues}
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

/** The providers and the page margin every prototype story sits in. */
export const StoryFrame: FC<FrameProps> = ({ children, ...props }) => (
    <DashboardControlsProviders {...props}>
        <Box p="xl">{children}</Box>
    </DashboardControlsProviders>
);
