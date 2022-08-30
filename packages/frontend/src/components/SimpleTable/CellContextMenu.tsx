import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { FC } from 'react';
import { CellContextMenuProps, TableColumn } from '../common/Table/types';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';

const ContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const { viewData } = useUnderlyingDataContext();

    const meta = cell.column.columnDef.meta as TableColumn['meta'];

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    const pivot = meta?.pivotReference?.pivotValues?.[0]
        ? {
              fieldId: meta?.pivotReference?.pivotValues?.[0].field,
              value: meta?.pivotReference?.pivotValues?.[0].value,
          }
        : undefined;

    return (
        <Menu>
            <MenuItem2
                text="View underlying data"
                icon="layers"
                onClick={() => {
                    viewData(
                        value,
                        meta,
                        cell.row.original || {},
                        undefined,
                        pivot,
                    );
                }}
            />
        </Menu>
    );
};

const CellContextMenu: FC<CellContextMenuProps> = ({
    cell,
    renderCell,
    onOpen,
    onClose,
}) => {
    return (
        <Popover2
            minimal
            defaultIsOpen
            position={Position.BOTTOM_RIGHT}
            content={<ContextMenu cell={cell} />}
            renderTarget={renderCell}
            onOpening={onOpen}
            onClosing={onClose}
        />
    );
};

export default CellContextMenu;
