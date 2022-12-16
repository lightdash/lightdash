import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    DashboardFilterRule,
    Explore,
    fieldId,
    FilterOperator,
    friendlyName,
    getFields,
    getItemId,
    isDimension,
    isField,
    MetricQuery,
    ResultRow,
} from '@lightdash/common';
import { uuid4 } from '@sentry/utils';
import React, { FC } from 'react';
import useDashboardFiltersForExplore from '../../hooks/dashboard/useDashboardFiltersForExplore';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const DashboardCellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell'> & {
        explore: Explore | undefined;
        tileUuid: string;
        metricQuery?: MetricQuery;
    }
> = ({ cell, explore, tileUuid, metricQuery }) => {
    const { openUnderlyingDataModel } = useMetricQueryDataContext();
    const { addDimensionDashboardFilter } = useDashboardContext();
    const dashboardFiltersThatApplyToChart = useDashboardFiltersForExplore(
        tileUuid,
        explore,
    );

    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};

    const filterField =
        isDimension(item) && !item.hidden
            ? [
                  {
                      id: uuid4(),
                      target: {
                          fieldId: fieldId(item),
                          tableName: item.table,
                      },
                      operator: FilterOperator.EQUALS,
                      values: [value.raw],
                  },
              ]
            : [];

    const fields = explore && getFields(explore);

    const possiblePivotFilters = (
        meta?.pivotReference?.pivotValues || []
    ).map<DashboardFilterRule>((pivot) => {
        const pivotField = fields?.find(
            (field) => getItemId(field) === pivot?.field,
        );
        return {
            id: uuid4(),
            target: {
                fieldId: pivot.field,
                tableName: pivotField?.table || '',
            },
            operator: FilterOperator.EQUALS,
            values: [pivot.value],
        };
    });
    const filters: DashboardFilterRule[] = [
        ...filterField,
        ...possiblePivotFilters,
    ];

    return (
        <Menu>
            {item && value.raw && isField(item) && (
                <UrlMenuItems urls={item.urls} cell={cell} />
            )}
            {isField(item) && (item.urls || []).length > 0 && <MenuDivider />}
            <MenuItem2
                text="View underlying data"
                icon="layers"
                onClick={() => {
                    openUnderlyingDataModel(
                        value,
                        meta,
                        cell.row.original || {},
                        undefined,
                        meta?.pivotReference,
                        dashboardFiltersThatApplyToChart,
                    );
                }}
            />
            <DrillDownMenuItem
                row={cell.row.original || {}}
                metricQuery={metricQuery}
                dashboardFilters={dashboardFiltersThatApplyToChart}
                pivotReference={meta?.pivotReference}
                selectedItem={item}
            />
            {filters.length > 0 && (
                <MenuItem2 icon="filter" text="Filter dashboard to...">
                    {filters.map((filter) => {
                        return (
                            <MenuItem2
                                key={filter.id}
                                text={`${friendlyName(
                                    filter.target.fieldId,
                                )} is ${filter.values && filter.values[0]}`}
                                onClick={() => {
                                    addDimensionDashboardFilter(filter, true);
                                }}
                            />
                        );
                    })}
                </MenuItem2>
            )}
        </Menu>
    );
};

export default DashboardCellContextMenu;
