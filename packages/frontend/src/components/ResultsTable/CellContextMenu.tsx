import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { isFilterableField } from 'common';
import React from 'react';
import { Cell } from 'react-table';
import { useFilters } from '../../hooks/useFilters';

type CellContextMenuProps = {
    cell: Cell;
};
export const CellContextMenu: React.FC<CellContextMenuProps> = ({
    children,
    cell,
}) => {
    const { addFilter } = useFilters();
    const field = cell.column?.field;
    if (field && isFilterableField(field)) {
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`Filter by "${cell.value}"`}
                            onClick={() => {
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
