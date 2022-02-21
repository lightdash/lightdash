import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { isFilterableField } from 'common';
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
    const field = column?.field;
    if (field && isFilterableField(field)) {
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`Filter by ${field.label}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                addFilter(field, undefined, false);
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

export default ColumnHeaderContextMenu;
