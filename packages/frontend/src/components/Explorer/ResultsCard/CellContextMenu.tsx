import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    Field,
    isField,
    isFilterableField,
    isMetric,
    MetricQuery,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useExplore } from '../../../hooks/useExplore';
import { useFilters } from '../../../hooks/useFilters';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { CellContextMenuProps } from '../../common/Table/types';
import DrillDownMenuItem from '../../DrillDownMenuItem';
import { useUnderlyingDataContext } from '../../UnderlyingData/UnderlyingDataProvider';
import UrlMenuItems from './UrlMenuItems';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell' | 'isEditMode'> & {
        itemsMap: Record<string, Field | TableCalculation>;
        metricQuery: MetricQuery;
    }
> = ({ cell, isEditMode, itemsMap, metricQuery }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { addFilter } = useFilters();
    const { viewData, tableName } = useUnderlyingDataContext();
    const { track } = useTracking();
    const { data: explore } = useExplore(tableName);
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    return (
        <Menu>
            {!!value.raw && isField(item) && (
                <UrlMenuItems
                    urls={item.urls}
                    cell={cell}
                    itemsMap={itemsMap}
                />
            )}

            {isField(item) && (item.urls || []).length > 0 && <MenuDivider />}

            <MenuItem2
                text="View underlying data"
                icon="layers"
                onClick={() => {
                    viewData(value, meta, cell.row.original || {});
                }}
            />

            {isEditMode && isField(item) && isFilterableField(item) && (
                <MenuItem2
                    icon="filter"
                    text={`Filter by "${value.formatted}"`}
                    onClick={() => {
                        track({
                            name: EventName.ADD_FILTER_CLICKED,
                        });
                        addFilter(
                            item,
                            value.raw === undefined ? null : value.raw,
                            true,
                        );
                    }}
                />
            )}

            {isField(item) && isMetric(item) && explore && (
                <DrillDownMenuItem
                    projectUuid={projectUuid}
                    row={cell.row.original || {}}
                    explore={explore}
                    metricQuery={metricQuery}
                />
            )}
        </Menu>
    );
};

export default CellContextMenu;
