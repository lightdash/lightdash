import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { cloneElement, FC, isValidElement } from 'react';
import { CellContextMenuProps, TableColumn } from '../common/Table/types';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';

interface ContextMenuProps {
    cell: Cell<ResultRow, ResultRow[0]>;
    meta: TableColumn['meta'];
}

const ContextMenu: FC<ContextMenuProps> = ({ meta, cell }) => {
    const { viewData } = useUnderlyingDataContext();

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
    boundaryElement,
    children,
    cell,
    onOpen,
    onClose,
}) => {
    const meta = cell.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    if (!item || !boundaryElement) {
        return <>{children}</>;
    }

    return (
        <Popover2
            minimal
            lazy
            usePortal
            position={Position.BOTTOM_RIGHT}
            boundary={boundaryElement}
            content={<ContextMenu cell={cell} meta={meta} />}
            renderTarget={({ ref, ...targetProps }) => {
                if (isValidElement(children)) {
                    return cloneElement(children, {
                        ref,
                        ...targetProps,
                    });
                } else {
                    throw new Error(
                        'CellContextMenu children must be a valid React element',
                    );
                }
            }}
            onOpening={onOpen}
            onClosing={onClose}
        />
    );
};

export default CellContextMenu;
