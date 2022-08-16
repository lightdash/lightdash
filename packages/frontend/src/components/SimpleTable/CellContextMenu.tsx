import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import React from 'react';
import { CellContextMenuProps, TableColumn } from '../common/Table/types';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
    children,
    cell,
}) => {
    const meta = cell.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const { viewData } = useUnderlyingDataContext();

    if (item) {
        const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`View underlying data`}
                            icon={'layers'}
                            onClick={(e) => {
                                viewData(value, meta, cell.row.original || {});
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
