import {
    getItemId,
    type Dashboard,
    type DashboardConfig,
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
    manyFields,
    manyFieldsByTile,
    manyFieldsTiles,
    parameterList,
    parameters,
    itemsMap,
    parameterValues,
    PROJECT_UUID,
    storyLightdashApi,
    tabs,
    tiles,
    zoomableFieldsByTile,
} from './fixtures';

// The dashboard's fields and tiles: the usual six tiles, or one tile over a
// 2,000-field project
const getDataset = (isManyFields: boolean) =>
    isManyFields
        ? {
              filterFields: manyFields,
              tiles: manyFieldsTiles,
              availableTileFilters: manyFieldsByTile,
          }
        : { filterFields: Object.values(fields), tiles, availableTileFilters };

const getSavedQueryFilters = ({
    filterFields,
    availableTileFilters: tileFilters,
}: ReturnType<typeof getDataset>) => {
    const filterFieldIndex = new Map(
        filterFields.map((field, index) => [getItemId(field), index]),
    );
    return Object.fromEntries(
        Object.entries(tileFilters).map(([tileUuid, tileFields]) => [
            tileUuid,
            tileFields.flatMap((field) => {
                const index = filterFieldIndex.get(getItemId(field));
                return index === undefined ? [] : [index];
            }),
        ]),
    );
};

/** The saved date zoom settings a story starts from. */
export type DateZoomStorySettings = Partial<
    Pick<
        DashboardConfig,
        | 'dateZoomGranularities'
        | 'defaultDateZoomGranularity'
        | 'dateZoomConfig'
    >
>;

const tracking = {
    data: {},
    track: action('track'),
    page: action('page'),
    identify: action('identify'),
};

const createStore = ({
    sections,
    hasParameters,
    isManyFields,
    dateZoom,
}: Omit<FrameProps, 'startOfWeek' | 'children'>) => {
    const dataset = getDataset(isManyFields);
    const { filterFields, tiles: datasetTiles } = dataset;
    const store = seedDashboardEditState(
        createDashboardTestStore({
            dashboardFilters,
            isEditMode: true,
            chartZoomableFieldsByTileUuid: zoomableFieldsByTile,
            source: {
                availableFilters: {
                    allFilterableFields: filterFields,
                    allFilterableMetrics: [],
                    savedQueryFilters: getSavedQueryFilters(dataset),
                    savedQueryMetricFilters: {},
                    hiddenFilterableFieldIds: [],
                },
                queryDashboard: {
                    uuid: DASHBOARD_UUID,
                    filters: dashboardFilters,
                    tiles: datasetTiles,
                    config: { controlSections: sections, ...dateZoom },
                } as unknown as Dashboard,
            },
        }),
        {
            dashboard: {
                config: {
                    controlSections: sections,
                    isDateZoomDisabled: false,
                    ...dateZoom,
                },
            },
            dashboardTabs: tabs,
            dashboardTiles: datasetTiles,
            activeTab: tabs[0],
        },
    );
    // No tile uses a parameter: the bar's "Add filter" goes straight to fields
    if (!hasParameters) return store;
    const sources = Object.fromEntries(
        selectTileQuerySources(store.getState()).map((source) => [
            source.tileUuid,
            JSON.stringify(source),
        ]),
    );
    store.dispatch(
        dashboardParametersActions.addDiscoveredParameterReferences({
            chartSavedValues: {},
            virtualViewSavedValues: {},
            definitions: Object.fromEntries(
                parameterList.map(({ key, definition }) => [key, definition]),
            ),
            references: Object.fromEntries(
                datasetTiles.map(({ uuid }) => [
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
    /** Tiles use the fixture parameters; false: none does. */
    hasParameters: boolean;
    /** One tile over 2,000 fields instead of the usual six. */
    isManyFields: boolean;
    /** Saved date zoom settings; none: the shipped defaults. */
    dateZoom: DateZoomStorySettings;
}>;

// Everything the shipped pickers and settings need, answered offline, fed
// as the shipped editor's `FilterSettings` feeds `FiltersProvider`
const DashboardControlsProviders: FC<FrameProps> = ({
    startOfWeek,
    children,
    ...options
}) => {
    const [queryClient] = useState(() =>
        createQueryClient({ queries: { retry: false } }),
    );
    const [store] = useState(() => createStore(options));
    const dataset = getDataset(options.isManyFields);
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
                                dashboardTiles={dataset.tiles}
                                filterableFieldsByTileUuid={
                                    dataset.availableTileFilters
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
    // The store is built on mount: new options build a new one
    <DashboardControlsProviders
        key={[
            ...props.sections.map(({ id, name }) => `${id}:${name}`),
            props.hasParameters,
            props.isManyFields,
            JSON.stringify(props.dateZoom),
        ].join('|')}
        {...props}
    >
        <Box p="xl">{children}</Box>
    </DashboardControlsProviders>
);
