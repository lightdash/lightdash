import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { isFilterableField } from '@lightdash/common';
import React from 'react';
import { Cell } from 'react-table';
import { useFilters } from '../../hooks/useFilters';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

type CellContextMenuProps = {
    cell: Cell;
};
export const CellContextMenu: React.FC<CellContextMenuProps> = ({
    children,
    cell,
}) => {
    const { addFilter } = useFilters();
    const field = cell.column?.field;
    const { track } = useTracking();

    if (field && isFilterableField(field)) {
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`Filter by "${cell.value}"`}
                            onClick={() => {
                                track({
                                    name: EventName.ADD_FILTER_CLICKED,
                                });
                                addFilter(
                                    field,
                                    cell.value === undefined
                                        ? null
                                        : cell.value,
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
