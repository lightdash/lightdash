import { Button, Divider, Menu, Position } from '@blueprintjs/core';
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
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { getSortLabel, SortDirection } from '../../../utils/sortUtils';
import { HeaderProps, TableColumn } from '../../common/Table/types';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from '../../TableCalculationModels';

const BolderLabel = styled.span`
    font-weight: 600;
`;

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
    const { addFilter } = useFilters();
    const { track } = useTracking();

    const meta = header.column.columnDef.meta;
    const item = meta?.item;

    const removeActiveField = useExplorerContext(
        (context) => context.actions.removeActiveField,
    );
    const addSortField = useExplorerContext(
        (context) => context.actions.addSortField,
    );
    const removeSortField = useExplorerContext(
        (context) => context.actions.removeSortField,
    );

    if (item && isField(item) && isFilterableField(item)) {
        const sort = meta.sort?.sort;
        const hasSort = !!sort;
        const isAscending = hasSort && !sort.descending;
        const isDescending = hasSort && sort.descending;
        const itemFieldId = fieldId(item);

        return (
            <Menu>
                <MenuItem2
                    text={
                        <>
                            Filter by <BolderLabel>{item.label}</BolderLabel>
                        </>
                    }
                    icon="filter"
                    onClick={() => {
                        track({ name: EventName.ADD_FILTER_CLICKED });
                        addFilter(item, undefined, false);
                    }}
                />

                <Divider />

                <MenuItem2
                    roleStructure="listoption"
                    selected={hasSort && isAscending}
                    text={
                        <>
                            Sort{' '}
                            <BolderLabel>
                                {getSortLabel(item, SortDirection.ASC)}
                            </BolderLabel>
                        </>
                    }
                    onClick={() =>
                        hasSort && isAscending
                            ? removeSortField(itemFieldId)
                            : addSortField(itemFieldId, { descending: false })
                    }
                />

                <MenuItem2
                    roleStructure="listoption"
                    selected={hasSort && isDescending}
                    text={
                        <>
                            Sort{' '}
                            <BolderLabel>
                                {getSortLabel(item, SortDirection.DESC)}
                            </BolderLabel>
                        </>
                    }
                    onClick={() =>
                        hasSort && isDescending
                            ? removeSortField(itemFieldId)
                            : addSortField(itemFieldId, { descending: true })
                    }
                />

                <Divider />

                <MenuItem2
                    text="Remove"
                    icon="cross"
                    intent="danger"
                    onClick={() => {
                        removeActiveField(itemFieldId);
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

                <Divider />

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

    if (meta && (meta.item || meta.isInvalidItem === true)) {
        return (
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
            </div>
        );
    } else {
        return null;
    }
};

export default ColumnHeaderContextMenu;
