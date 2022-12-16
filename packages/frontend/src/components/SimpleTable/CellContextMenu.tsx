import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { isField, MetricQuery, ResultRow } from '@lightdash/common';
import React, { FC } from 'react';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell'> & {
        metricQuery?: MetricQuery;
    }
> = ({ cell, metricQuery }) => {
    const { openUnderlyingDataModel } = useMetricQueryDataContext();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};

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
                    );
                }}
            />
            <DrillDownMenuItem
                row={cell.row.original || {}}
                metricQuery={metricQuery}
                pivotReference={meta?.pivotReference}
                selectedItem={item}
            />
        </Menu>
    );
};

export default CellContextMenu;
