import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    Explore,
    isField,
    isMetric,
    MetricQuery,
    ResultRow,
} from '@lightdash/common';
import React, { FC } from 'react';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../UnderlyingData/DrillDownMenuItem';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell'> & {
        explore?: Explore;
        metricQuery?: MetricQuery;
    }
> = ({ cell, explore, metricQuery }) => {
    const { viewData } = useUnderlyingDataContext();
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
                    viewData(
                        value,
                        meta,
                        cell.row.original || {},
                        undefined,
                        meta?.pivotReference,
                    );
                }}
            />
            {isField(item) && isMetric(item) && explore && metricQuery && (
                <DrillDownMenuItem
                    row={cell.row.original || {}}
                    explore={explore}
                    metricQuery={metricQuery}
                    pivotReference={meta?.pivotReference}
                />
            )}
        </Menu>
    );
};

export default CellContextMenu;
