import { subject } from '@casl/ability';
import {
    createDashboardFilterRuleFromField,
    hasCustomDimension,
    isDimension,
    isDimensionValueInvalidDate,
    isField,
    isFilterableField,
    type FilterDashboardToRule,
    type ItemsMap,
    type ResultValue,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import MantineIcon from '../common/MantineIcon';
import { type CellContextMenuProps } from '../common/Table/types';
import { FilterDashboardTo } from '../DashboardFilter/FilterDashboardTo';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const DashboardCellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell'> & {
        itemsMap: ItemsMap | undefined;
    }
> = ({ cell, itemsMap }) => {
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();

    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );

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

    const filterValue =
        value.raw === undefined ||
        (isDimension(item) && isDimensionValueInvalidDate(item, value))
            ? null // Set as null if value is invalid date or undefined
            : value.raw;

    const filterField =
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

    const possiblePivotFilters = (
        meta?.pivotReference?.pivotValues || []
    ).reduce<FilterDashboardToRule[]>((acc, pivot) => {
        const pivotField = itemsMap?.[pivot?.field];
        if (
            !pivotField ||
            !isField(pivotField) ||
            !isFilterableField(pivotField)
        )
            return acc;

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

    const filters = [...filterField, ...possiblePivotFilters];
    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [value, clipboard, showToastSuccess]);

    const handleViewUnderlyingData = useCallback(() => {
        if (meta === undefined) return;

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });

        openUnderlyingDataModal({
            item: meta.item,
            value,
            fieldValues,
            pivotReference: meta?.pivotReference,
        });
    }, [
        track,
        user,
        projectUuid,
        openUnderlyingDataModal,
        meta,
        value,
        fieldValues,
    ]);

    return (
        <>
            {item && value.raw && isField(item) && (
                <UrlMenuItems urls={item.urls} cell={cell} />
            )}

            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}

            <Menu.Item
                icon={<MantineIcon icon={IconCopy} />}
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>

            {item && !isDimension(item) && !hasCustomDimension(metricQuery) && (
                <Can
                    I="view"
                    this={subject('UnderlyingData', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid: projectUuid,
                    })}
                >
                    <Menu.Item
                        icon={<MantineIcon icon={IconStack} />}
                        onClick={handleViewUnderlyingData}
                    >
                        View underlying data
                    </Menu.Item>
                </Can>
            )}

            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                <DrillDownMenuItem
                    item={item}
                    fieldValues={fieldValues}
                    pivotReference={meta?.pivotReference}
                    trackingData={{
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    }}
                />
            </Can>

            {filters.length > 0 && (
                <FilterDashboardTo
                    filters={filters}
                    onAddFilter={addDimensionDashboardFilter}
                />
            )}
        </>
    );
};

export default DashboardCellContextMenu;
