import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import React from 'react';
import { HeaderGroup } from 'react-table';
import { useFilters } from '../../hooks/useFilters';

type ColumnHeaderContextMenuProps = {
    column: HeaderGroup | undefined;
};

const ColumnHeaderContextMenu: React.FC<ColumnHeaderContextMenuProps> = ({
    children,
    column,
}) => {
    const { addFilter } = useFilters();
    const cantFilter = !column || column.type === 'table_calculation';

    const menuContent = column && (
        <Menu>
            <MenuItem
                label={`Filter ${column.field?.name}`}
                onClick={(e) => {
                    e.stopPropagation();
                    addFilter(column?.field, undefined, false);
                }}
            />
        </Menu>
    );
    return (
        <ContextMenu2 disabled={cantFilter} content={menuContent}>
            {children}
        </ContextMenu2>
    );
};

export default ColumnHeaderContextMenu;
