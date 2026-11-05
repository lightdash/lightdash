import { type DashboardFilterableField } from '@lightdash/common';
import { Box, Group, Stack } from '@mantine/core';
import { useMemo, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    selectSqlChartTilesMetadata,
    useDashboardSelector,
} from '../dashboard/store';
import SqlColumnSelect from '../dashboardFilters/FilterConfiguration/SqlColumnSelect';
import { getUniqueSqlColumns } from '../dashboardFilters/FilterConfiguration/utils';
import { useAddMenuBack } from './addMenuBack';
import { FieldPicker, PickerBack } from './ControlPickers';
import { DropdownClass } from './DropdownClass';
import { useRailContractClasses } from './railContractClasses';
import { useControlsSidebar } from './useControlsSidebar';

const NO_FIELDS: DashboardFilterableField[] = [];
const NO_TILE_FIELDS: Record<string, DashboardFilterableField[]> = {};

// A filter with no field yet: the shipped field search, opened
export const FieldsAndTiles: FC = () => {
    const { editingRule, addFirstField, addFirstSqlColumn, isViewer } =
        useControlsSidebar();
    const onBack = useAddMenuBack();
    const contractClasses = useRailContractClasses();
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const allFilterableMetrics = useDashboardContext(
        (c) => c.allFilterableMetrics,
    );
    const sqlChartTilesMetadata = useDashboardSelector(
        selectSqlChartTilesMetadata,
    );

    const tiles = useMemo(() => dashboardTiles ?? [], [dashboardTiles]);
    const availableTileFilters = filterableFieldsByTileUuid ?? NO_TILE_FIELDS;
    const dimensions = allFilterableFields ?? NO_FIELDS;
    const metrics = allFilterableMetrics ?? NO_FIELDS;
    // What the shipped "Add filter" lists: every time grain is its own field
    const starterFields = useMemo(
        () => [...dimensions, ...metrics],
        [dimensions, metrics],
    );
    const sqlColumnOptions = useMemo(
        () => getUniqueSqlColumns(sqlChartTilesMetadata),
        [sqlChartTilesMetadata],
    );

    if (editingRule === null) return null;

    // As in the shipped "Add filter": columns only when no tile has fields
    return (
        <Stack gap="xs" data-controls-start>
            <DropdownClass
                className={contractClasses?.addFilterDropdown ?? null}
            >
                {starterFields.length > 0 ? (
                    <FieldPicker
                        fields={starterFields}
                        availableTileFilters={availableTileFilters}
                        tiles={tiles}
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
                        onBack={onBack}
                        withinPortal
                        isViewer={isViewer}
                        onPick={addFirstField}
                    />
                ) : (
                    <Group gap="xs" wrap="nowrap">
                        {onBack !== null && <PickerBack onBack={onBack} />}
                        <Box flex={1}>
                            <SqlColumnSelect
                                columns={sqlColumnOptions}
                                value={undefined}
                                onChange={(column) => {
                                    addFirstSqlColumn(
                                        column,
                                        Object.fromEntries(
                                            Object.entries(
                                                sqlChartTilesMetadata,
                                            ).map(([tileUuid, metadata]) => [
                                                tileUuid,
                                                metadata.columns,
                                            ]),
                                        ),
                                    );
                                }}
                            />
                        </Box>
                    </Group>
                )}
            </DropdownClass>
        </Stack>
    );
};
