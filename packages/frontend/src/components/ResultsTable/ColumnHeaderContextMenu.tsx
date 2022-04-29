import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { fieldId, isDimension, isFilterableField } from 'common';
import React from 'react';
import { HeaderGroup } from 'react-table';
import { useFilters } from '../../hooks/useFilters';
import { useExplorer } from '../../providers/ExplorerProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

type ColumnHeaderContextMenuProps = {
    column: HeaderGroup | undefined;
};

const ColumnHeaderContextMenu: React.FC<ColumnHeaderContextMenuProps> = ({
    children,
    column,
}) => {
    const { addFilter } = useFilters();
    const field = column?.field;
    const { track } = useTracking();
    const {
        actions: { toggleActiveField },
    } = useExplorer();
    if (field && isFilterableField(field)) {
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`Filter by ${field.label}`}
                            icon={'filter'}
                            onClick={(e) => {
                                track({
                                    name: EventName.ADD_FILTER_CLICKED,
                                });
                                e.stopPropagation();
                                addFilter(field, undefined, false);
                            }}
                        />
                        <MenuItem
                            text={`Remove`}
                            icon={'cross'}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleActiveField(
                                    fieldId(field),
                                    isDimension(field),
                                );
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

export default ColumnHeaderContextMenu;
