import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import {
    fieldId,
    isDimension,
    isField,
    isFilterableField,
} from '@lightdash/common';
import React from 'react';
import { useFilters } from '../../hooks/useFilters';
import { useExplorer } from '../../providers/ExplorerProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { HeaderProps, TableColumn } from '../common/Table';

const ColumnHeaderContextMenu: React.FC<HeaderProps> = ({
    children,
    header,
}) => {
    const { addFilter } = useFilters();
    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const { track } = useTracking();
    const {
        actions: { toggleActiveField },
    } = useExplorer();
    if (item && isField(item) && isFilterableField(item)) {
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`Filter by ${item.label}`}
                            icon={'filter'}
                            onClick={(e) => {
                                track({
                                    name: EventName.ADD_FILTER_CLICKED,
                                });
                                e.stopPropagation();
                                addFilter(item, undefined, false);
                            }}
                        />
                        <MenuItem
                            text={`Remove`}
                            icon={'cross'}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleActiveField(
                                    fieldId(item),
                                    isDimension(item),
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
