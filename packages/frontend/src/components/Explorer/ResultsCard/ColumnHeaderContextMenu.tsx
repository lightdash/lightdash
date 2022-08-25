import { Button, Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import {
    fieldId,
    isField,
    isFilterableField,
    TableCalculation,
} from '@lightdash/common';
import { FC, useState } from 'react';
import styled from 'styled-components';
import { useFilters } from '../../../hooks/useFilters';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { HeaderProps, TableColumn } from '../../common/Table/types';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from '../../TableCalculationModels';

const FlatButton = styled(Button)`
    min-height: 16px !important;
`;

interface ContextMenuProps extends HeaderProps {
    onToggleCalculationEditModal: (value: boolean) => void;
    onToggleCalculationDeleteModal: (value: boolean) => void;
}

const ContextMenu: FC<ContextMenuProps> = ({
    header,
    onToggleCalculationEditModal,
    onToggleCalculationDeleteModal,
}) => {
    const {
        actions: { removeActiveField },
    } = useExplorer();
    const { addFilter } = useFilters();
    const { track } = useTracking();

    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    if (item && isField(item) && isFilterableField(item)) {
        return (
            <Menu>
                <MenuItem2
                    text={`Filter by ${item.label}`}
                    icon="filter"
                    onClick={() => {
                        track({ name: EventName.ADD_FILTER_CLICKED });
                        addFilter(item, undefined, false);
                    }}
                />

                <MenuItem22
                    text="Remove"
                    icon="cross"
                    intent="danger"
                    onClick={() => {
                        removeActiveField(fieldId(item));
                    }}
                />
            </Menu>
        );
    } else if (meta?.isInvalidItem) {
        return (
            <Menu>
                <MenuItem2
                    text="Remove"
                    icon="cross"
                    intent="danger"
                    onClick={() => {
                        removeActiveField(header.column.id);
                    }}
                />
            </Menu>
        );
    } else if (meta?.item && !isField(meta.item)) {
        return (
            <Menu>
                <MenuItem2
                    text="Edit calculation"
                    icon="edit"
                    onClick={() => {
                        track({
                            name: EventName.EDIT_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationEditModal(true);
                    }}
                />
                <MenuItem2
                    text="Remove"
                    icon="cross"
                    intent="danger"
                    onClick={() => {
                        track({
                            name: EventName.DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationDeleteModal(true);
                    }}
                />
            </Menu>
        );
    } else {
        return null;
    }
};

const ColumnHeaderContextMenu: FC<HeaderProps> = ({ header }) => {
    const [showUpdate, setShowUpdate] = useState(false);
    const [showDelete, setShowDelete] = useState(false);

    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    return (
        <>
            <div
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <Popover2
                    lazy
                    minimal
                    position={Position.BOTTOM_RIGHT}
                    content={
                        <ContextMenu
                            header={header}
                            onToggleCalculationEditModal={setShowUpdate}
                            onToggleCalculationDeleteModal={setShowDelete}
                        />
                    }
                >
                    <FlatButton minimal small icon="more" />
                </Popover2>
            </div>

            {showUpdate && (
                <UpdateTableCalculationModal
                    isOpen
                    tableCalculation={item as TableCalculation}
                    onClose={() => setShowUpdate(false)}
                />
            )}

            {showDelete && (
                <DeleteTableCalculationModal
                    isOpen
                    tableCalculation={item as TableCalculation}
                    onClose={() => setShowDelete(false)}
                />
            )}
        </>
    );
};

export default ColumnHeaderContextMenu;
