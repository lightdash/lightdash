import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import {
    Field,
    isField,
    isFilterableField,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { cloneElement, FC, isValidElement } from 'react';
import { useFilters } from '../../../hooks/useFilters';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { CellContextMenuProps, TableColumn } from '../../common/Table/types';
import { useUnderlyingDataContext } from '../../UnderlyingData/UnderlyingDataProvider';

interface ContextMenuProps {
    cell: Cell<ResultRow>;
    item?: Field | TableCalculation;
    meta: TableColumn['meta'];
    isEditMode: boolean;
}

const ContextMenu: FC<ContextMenuProps> = ({
    meta,
    item,
    cell,
    isEditMode,
}) => {
    const { addFilter } = useFilters();
    const { viewData } = useUnderlyingDataContext();
    const { track } = useTracking();

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};

    return (
        <Menu>
            <MenuItem2
                text="View underlying data"
                icon="layers"
                onClick={() => {
                    viewData(value, meta, cell.row.original || {});
                }}
            />

            {isEditMode && isField(item) && isFilterableField(item) && (
                <MenuItem2
                    icon="filter"
                    text={`Filter by "${value.formatted}"`}
                    onClick={() => {
                        track({
                            name: EventName.ADD_FILTER_CLICKED,
                        });
                        addFilter(
                            item,
                            value.raw === undefined ? null : value.raw,
                            true,
                        );
                    }}
                />
            )}
        </Menu>
    );
};

const CellContextMenu: FC<
    CellContextMenuProps & {
        isEditMode: boolean;
    }
> = ({ isEditMode, children, cell, onOpen, onClose }) => {
    const meta = cell.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    if (!item) {
        return <>{children}</>;
    }

    return (
        <Popover2
            minimal
            position={Position.BOTTOM_RIGHT}
            content={
                <ContextMenu
                    cell={cell}
                    item={item}
                    meta={meta}
                    isEditMode={isEditMode}
                />
            }
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
