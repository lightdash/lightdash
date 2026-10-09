import { FeatureFlags, type DashboardFilterableField } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import FilterFieldSelect from '../dashboardFilters/FilterConfiguration/FilterFieldSelect';
import SqlColumnSelect from '../dashboardFilters/FilterConfiguration/SqlColumnSelect';
import { getUniqueSqlColumns } from '../dashboardFilters/FilterConfiguration/utils';
import classes from './FieldsAndTiles.module.css';
import { useControlsSidebar } from './useControlsSidebar';
import { focusLabelInput } from './useLabelDraft';

const NO_FIELDS: DashboardFilterableField[] = [];
const NO_TILE_FIELDS: Record<string, DashboardFilterableField[]> = {};

export const FieldsAndTiles: FC = () => {
    const { editingRule, isPlaceholder, addFirstField, addFirstSqlColumn } =
        useControlsSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const allFilterableMetrics = useDashboardContext(
        (c) => c.allFilterableMetrics,
    );
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    // Creating a metric filter is gated like the shipped "Add filter"
    const { data: metricFiltersFlag } = useServerFeatureFlag(
        FeatureFlags.MetricDashboardFilters,
    );
    const canCreateMetricFilters =
        metricFiltersFlag?.enabled ?? import.meta.env.DEV;

    const tiles = useMemo(() => dashboardTiles ?? [], [dashboardTiles]);
    const availableTileFilters = filterableFieldsByTileUuid ?? NO_TILE_FIELDS;

    const dimensions = allFilterableFields ?? NO_FIELDS;
    const metrics = allFilterableMetrics ?? NO_FIELDS;
    // What the shipped "Add filter" lists: every time grain is its own field
    const starterFields = useMemo(
        () => [...dimensions, ...(canCreateMetricFilters ? metrics : [])],
        [dimensions, metrics, canCreateMetricFilters],
    );
    const sqlColumnOptions = useMemo(
        () => getUniqueSqlColumns(sqlChartTilesMetadata),
        [sqlChartTilesMetadata],
    );

    if (editingRule === null) return null;

    if (isPlaceholder) {
        // As in the shipped "Add filter": columns only when no tile has fields
        const hasFields = starterFields.length > 0;
        return (
            <Stack gap="xs">
                {hasFields ? (
                    <FilterFieldSelect
                        fields={starterFields}
                        availableTileFilters={availableTileFilters}
                        tiles={tiles}
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
                        selectedField={undefined}
                        onChange={(field) => {
                            addFirstField(field);
                            // Naming it comes next
                            focusLabelInput();
                        }}
                    />
                ) : (
                    <SqlColumnSelect
                        columns={sqlColumnOptions}
                        value={undefined}
                        onChange={(column) => {
                            addFirstSqlColumn(
                                column,
                                Object.fromEntries(
                                    Object.entries(sqlChartTilesMetadata).map(
                                        ([tileUuid, metadata]) => [
                                            tileUuid,
                                            metadata.columns,
                                        ],
                                    ),
                                ),
                            );
                            focusLabelInput();
                        }}
                    />
                )}
                <Text fz="xs" c="dimmed" className={classes.hint}>
                    {hasFields
                        ? 'Pick a field to filter tiles by it.'
                        : 'Pick a column to filter tiles by it.'}
                </Text>
            </Stack>
        );
    }

    return null;
};
