import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { isField, isFilterableField } from '@lightdash/common';
import React from 'react';
import { useFilters } from '../../hooks/useFilters';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { CellContextMenuProps, TableColumn } from '../common/Table/types';

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
    children,
    cell,
}) => {
    const { addFilter } = useFilters();
    const meta = cell.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const { track } = useTracking();

    if (item && isField(item) && isFilterableField(item)) {
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`Filter by "${cell.getValue()}"`}
                            onClick={() => {
                                track({
                                    name: EventName.ADD_FILTER_CLICKED,
                                });
                                addFilter(
                                    item,
                                    cell.getValue() === undefined
                                        ? null
                                        : cell.getValue(),
                                    true,
                                );
                            }}
                        />
                    </Menu>
                }
            >
                {children}
            </ContextMenu2>
        );
    }
    return <>{children}</>;
};
