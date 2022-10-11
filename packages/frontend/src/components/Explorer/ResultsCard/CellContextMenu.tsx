import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { isField, isFilterableField, ResultRow } from '@lightdash/common';
import React, { FC } from 'react';
import { useFilters } from '../../../hooks/useFilters';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { CellContextMenuProps } from '../../common/Table/types';
import { useUnderlyingDataContext } from '../../UnderlyingData/UnderlyingDataProvider';
import UrlMenuItems from './UrlMenuItems';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell' | 'isEditMode'>
> = ({ cell, isEditMode }) => {
    const { addFilter } = useFilters();
    const { viewData } = useUnderlyingDataContext();
    const { track } = useTracking();

    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};

    return (
        <Menu>
            {!!value.raw && isField(item) && (
                <UrlMenuItems urls={item.urls} cell={cell} />
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
        </Menu>
    );
};

export default CellContextMenu;
