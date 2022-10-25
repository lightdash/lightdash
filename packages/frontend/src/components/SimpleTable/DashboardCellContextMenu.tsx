import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    DashboardFilterRule,
    Explore,
    fieldId,
    FilterOperator,
    FilterRule,
    friendlyName,
    getFields,
    isDimension,
    isField,
    ResultRow,
} from '@lightdash/common';
import { uuid4 } from '@sentry/utils';
import React, { FC, useMemo } from 'react';
import { track } from 'rudder-sdk-js';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { EventName } from '../../types/Events';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';
import CellContextMenu from './CellContextMenu';

const DashboardCellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell'> & { explore: Explore | undefined }
> = ({ cell, explore }) => {
    const { viewData } = useUnderlyingDataContext();
    const { addDimensionDashboardFilter } = useDashboardContext();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    const pivot = meta?.pivotReference?.pivotValues?.[0]
        ? {
              fieldId: meta?.pivotReference?.pivotValues?.[0].field,
              value: meta?.pivotReference?.pivotValues?.[0].value,
          }
        : undefined;

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
    const pivotField = fields?.find(
        (field) => `${field.table}_${field.name}` === pivot?.fieldId,
    );

    const filterPivot = pivot
        ? [
              {
                  id: uuid4(),
                  target: {
                      fieldId: pivot.fieldId,
                      tableName: pivotField?.table || '',
                  },
                  operator: FilterOperator.EQUALS,
                  values: [pivot.value],
              },
          ]
        : [];
    const filters: DashboardFilterRule[] = [...filterField, ...filterPivot];

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
                    viewData(
                        value,
                        meta,
                        cell.row.original || {},
                        undefined,
                        pivot,
                    );
                }}
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
