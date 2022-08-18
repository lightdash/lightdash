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
import { isUrl } from '../../common/Table/ScrollableTable/RichBodyCell';
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
            {value.raw && isUrl(value.raw) && (
                <MenuItem2
                    icon="link"
                    text="Go to link"
                    onClick={() => {
                        track({
                            name: EventName.GO_TO_LINK_CLICKED,
                        });
                        window.open(value.raw, '_blank');
                    }}
                />
            )}

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
> = ({ isEditMode, boundaryElement, children, cell, onOpen, onClose }) => {
    const meta = cell.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    if (!item || !boundaryElement) {
        return <>{children}</>;
    }

    return (
        <Popover2
            minimal
            lazy
            position={Position.BOTTOM_RIGHT}
            portalContainer={boundaryElement}
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
