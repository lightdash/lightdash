import { Menu } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    fieldId,
    isField,
    isFilterableField,
    TableCalculation,
} from '@lightdash/common';
import React, { useState } from 'react';
import { useFilters } from '../../../hooks/useFilters';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { HeaderProps, TableColumn } from '../../common/Table/types';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from '../../TableCalculationModels';

const ColumnHeaderContextMenu: React.FC<HeaderProps> = ({
    children,
    header,
}) => {
    const { addFilter } = useFilters();
    const [showUpdate, setShowUpdate] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const { track } = useTracking();

    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const {
        actions: { removeActiveField },
    } = useExplorer();

    if (item && isField(item) && isFilterableField(item)) {
        return (
            <Menu>
                <MenuItem2
                    text={`Filter by ${item.label}`}
                    icon="filter"
                    onClick={(e) => {
                        track({ name: EventName.ADD_FILTER_CLICKED });
                        addFilter(item, undefined, false);
                    }}
                />

                <MenuItem22
                    text="Remove"
                    icon="cross"
                    onClick={(e) => {
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
                    onClick={(e) => {
                        removeActiveField(header.column.id);
                    }}
                />
            </Menu>
        );
    } else if (meta?.item && !isField(meta.item)) {
        return (
            <>
                <Menu>
                    <MenuItem2
                        text="Edit calculation"
                        icon="edit"
                        onClick={(e) => {
                            setShowUpdate(true);

                            track({
                                name: EventName.EDIT_TABLE_CALCULATION_BUTTON_CLICKED,
                            });
                        }}
                    />
                    <MenuItem2
                        text="Remove"
                        icon="cross"
                        onClick={(e) => {
                            setShowDelete(true);

                            track({
                                name: EventName.DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
                            });
                        }}
                    />
                </Menu>

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
    } else {
        return <>{children}</>;
    }
};

export default ColumnHeaderContextMenu;
