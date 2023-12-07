import { FieldUrl, isField, ResultValue } from '@lightdash/common';
import { FC } from 'react';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const value: ResultValue = cell.getValue()?.value || {};

    const urls: FieldUrl[] | undefined =
        value.raw && isField(item) ? item.urls : undefined;

    if (!urls) {
        return null;
    }
    return <UrlMenuItems urls={urls} cell={cell} />;
};

export default CellContextMenu;
