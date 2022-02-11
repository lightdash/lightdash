import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import React from 'react';
import { HeaderGroup } from 'react-table';
import { useFilters } from '../../hooks/useFilters';

type ColumnHeaderContextMenuProps = {
    column: HeaderGroup | undefined;
};
export const ColumnHeaderContextMenu: React.FC<ColumnHeaderContextMenuProps> =
    ({ children, column }) => {
        const { addFilter } = useFilters();
        const menuContent =
            column === undefined ? undefined : (
                <Menu>
                    <MenuItem
                        label={`Filter ${column.field.name}`}
                        onClick={() => {
                            addFilter(column.field, undefined);
                        }}
                    />
                </Menu>
            );
        return (
            <ContextMenu2 disabled={column === undefined} content={menuContent}>
                {children}
            </ContextMenu2>
        );
    };
