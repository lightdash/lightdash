import {
    getItemId,
    type Dashboard,
    type DashboardControlSection,
    type WeekDay,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC, type PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { action } from 'storybook/actions';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import {
    dashboardParametersActions,
    selectTileQuerySources,
} from '../../features/dashboard/store';
import { LightdashApiContext } from '../../providers/LightdashApi/LightdashApiContext';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import TrackingContext from '../../providers/Tracking/context';
import AppProviderMock from '../../testing/__mocks__/providers/AppProvider.mock';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import {
    availableTileFilters,
    DASHBOARD_UUID,
    dashboardFilters,
    fields,
    parameterList,
    parameters,
    itemsMap,
    parameterValues,
    PROJECT_UUID,
    storyLightdashApi,
    tabs,
    tiles,
} from './fixtures';

const filterFields = Object.values(fields);
const filterFieldIndex = new Map(
    filterFields.map((field, index) => [getItemId(field), index]),
);
const savedQueryFilters = Object.fromEntries(
    Object.entries(availableTileFilters).map(([tileUuid, tileFields]) => [
        tileUuid,
        tileFields.flatMap((field) => {
            const index = filterFieldIndex.get(getItemId(field));
            return index === undefined ? [] : [index];
        }),
    ]),
);

const tracking = {
    data: {},
    track: action('track'),
    page: action('page'),
    identify: action('identify'),
};

const createStore = (sections: DashboardControlSection[]) => {
    const store = seedDashboardEditState(
        createDashboardTestStore({
            dashboardFilters,
            isEditMode: true,
            source: {
                availableFilters: {
                    allFilterableFields: filterFields,
                    allFilterableMetrics: [],
                    savedQueryFilters,
                    savedQueryMetricFilters: {},
                    hiddenFilterableFieldIds: [],
                },
                queryDashboard: {
                    uuid: DASHBOARD_UUID,
                    filters: dashboardFilters,
                    tiles,
                    config: { controlSections: sections },
                } as unknown as Dashboard,
            },
        }),
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
    const sources = Object.fromEntries(
        selectTileQuerySources(store.getState()).map((source) => [
            source.tileUuid,
            JSON.stringify(source),
        ]),
    );
    store.dispatch(
        dashboardParametersActions.addDiscoveredParameterReferences({
            definitions: Object.fromEntries(
                parameterList.map(({ key, definition }) => [key, definition]),
            ),
            references: Object.fromEntries(
                tiles.map(({ uuid }) => [
                    uuid,
                    parameterList
                        .filter(({ tileUuids }) => tileUuids.includes(uuid))
                        .map(({ key }) => key),
                ]),
            ),
            sources,
        }),
    );
    store.dispatch(
        dashboardParametersActions.syncParameterControls({
            controls: [
                {
                    id: 'story-week-start',
                    label: null,
                    value: 'Monday',
                    valueType: { type: 'string', multiple: false },
                    parameters: {
                        [parameters.ordersWeekStart.key]: 'all',
                    },
                },
            ],
            isSaved: true,
        }),
    );
    return store;
};

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
        <MemoryRouter initialEntries={[`/projects/${PROJECT_UUID}`]}>
            <QueryClientProvider client={queryClient}>
                <LightdashApiContext.Provider value={storyLightdashApi}>
                    <TrackingContext.Provider value={tracking}>
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
                                <AppProviderMock>
                                    <Routes>
                                        <Route
                                            path="/projects/:projectUuid"
                                            element={children}
                                        />
                                    </Routes>
                                </AppProviderMock>
                            </FiltersProvider>
                        </DashboardStoreTestProvider>
                    </TrackingContext.Provider>
                </LightdashApiContext.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    );
};

/** The providers and the page margin every dashboard controls story uses. */
export const StoryFrame: FC<FrameProps> = ({ children, ...props }) => (
    // The store is built on mount: new sections build a new one
    <DashboardControlsProviders
        key={props.sections.map(({ id, name }) => `${id}:${name}`).join('|')}
        {...props}
    >
        <Box p="xl">{children}</Box>
    </DashboardControlsProviders>
);
