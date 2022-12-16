import { Menu } from '@blueprintjs/core';
import { FieldUrl, isField, ResultRow } from '@lightdash/common';
import React, { FC } from 'react';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};

    const urls: FieldUrl[] | undefined =
        value.raw && isField(item) ? item.urls : undefined;

    if (!urls) {
        return null;
    }
    return (
        <Menu>
            <UrlMenuItems urls={urls} cell={cell} />
        </Menu>
    );
};

export default CellContextMenu;
