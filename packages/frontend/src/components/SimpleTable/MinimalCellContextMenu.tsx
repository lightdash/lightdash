import {
    createDashboardFilterRuleFromField,
    isDimension,
    isDimensionValueInvalidDate,
    isField,
    isFilterableField,
    type FilterDashboardToRule,
    type ResultValue,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useCallback, useMemo, type FC } from 'react';
import { FilterDashboardTo } from '../../features/dashboardFilters/FilterDashboardTo';
import useToaster from '../../hooks/toaster/useToaster';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import { type CellContextMenuProps } from '../common/Table/types';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

const MinimalDashboardCellInteractions: FC<
    Pick<CellContextMenuProps, 'cell'>
> = ({ cell }) => {
    const { embeddedDashboardInteractivity, itemsMap } =
        useVisualizationContext();
    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );
    const projectUuid = useProjectUuid();

    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const value: ResultValue = cell.getValue()?.value || {};
    const fieldValues = mapValues(cell.row.original, (v) => v?.value) || {};

    const filterValue =
        value.raw === undefined ||
        (isDimension(item) && isDimensionValueInvalidDate(item, value))
            ? null
            : value.raw;

    const fieldFilters =
        isDimension(item) && !item.hidden
            ? [
                  createDashboardFilterRuleFromField({
                      field: item,
                      availableTileFilters: {},
                      isTemporary: true,
                      value: filterValue,
                  }),
              ]
            : [];

    const pivotFilters = (meta?.pivotReference?.pivotValues || []).reduce<
        FilterDashboardToRule[]
    >((acc, pivot) => {
        const pivotField = itemsMap?.[pivot.field];
        if (
            !pivotField ||
            !isField(pivotField) ||
            !isFilterableField(pivotField)
        ) {
            return acc;
        }

        return [
            ...acc,
            createDashboardFilterRuleFromField({
                field: pivotField,
                availableTileFilters: {},
                isTemporary: true,
                value: pivot.value,
            }),
        ];
    }, []);

    const filters = [...fieldFilters, ...pivotFilters];

    return (
        <>
            {embeddedDashboardInteractivity?.canDrillDown && (
                <DrillDownMenuItem
                    item={item}
                    fieldValues={fieldValues}
                    pivotReference={meta?.pivotReference}
                    trackingData={{
                        organizationId: undefined,
                        userId: undefined,
                        projectId: projectUuid,
                    }}
                />
            )}

            {embeddedDashboardInteractivity?.canCrossFilter &&
                filters.length > 0 && (
                    <FilterDashboardTo
                        filters={filters}
                        onAddFilter={addDimensionDashboardFilter}
                    />
                )}
        </>
    );
};

const MinimalCellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({
    cell,
}) => {
    const { showToastSuccess } = useToaster();
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();
    const { embeddedDashboardInteractivity } = useVisualizationContext();

    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const fieldValues = useMemo(
        () => mapValues(cell.row.original, (v) => v?.value) || {},
        [cell.row.original],
    );

    const clipboard = useClipboard({ timeout: 200 });

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [clipboard, showToastSuccess, value.formatted]);

    const handleViewUnderlyingData = useCallback(() => {
        if (meta === undefined) return;

        openUnderlyingDataModal({
            item: meta.item,
            value,
            fieldValues,
            pivotReference: meta?.pivotReference,
        });
    }, [openUnderlyingDataModal, meta, value, fieldValues]);

    return (
        <>
            {item &&
            value.raw !== undefined &&
            value.raw !== null &&
            isField(item) ? (
                <UrlMenuItems urls={item.urls} cell={cell} showErrors={false} />
            ) : null}

            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}

            <Menu.Item
                leftSection={
                    <MantineIcon icon={IconCopy} size="md" fillOpacity={0} />
                }
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>

            {item && !isDimension(item) && metricQuery && (
                <UnderlyingDataMenuItem
                    metricQuery={metricQuery}
                    onViewUnderlyingData={handleViewUnderlyingData}
                />
            )}

            {embeddedDashboardInteractivity && (
                <MinimalDashboardCellInteractions cell={cell} />
            )}
        </>
    );
};

export default MinimalCellContextMenu;
