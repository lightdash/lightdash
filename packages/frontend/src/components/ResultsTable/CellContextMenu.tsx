import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
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
    return (
        <ContextMenu2
            content={
                <Menu>
                    <MenuItem
                        label={`Filter on "${cell.value}"`}
                        onClick={() => {
                            addFilter(cell.column.field, cell.value);
                        }}
                    />
                </Menu>
            }
        >
            {children}
        </ContextMenu2>
    );
};
