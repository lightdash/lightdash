import { Menu, MenuItem } from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { isField, isFilterableField, ResultRow } from '@lightdash/common';
import React from 'react';
import { useFilters } from '../../../hooks/useFilters';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { CellContextMenuProps, TableColumn } from '../../common/Table/types';
import { useUnderlyingDataContext } from '../../UnderlyingData/UnderlyingDataProvider';

export const CellContextMenu: React.FC<
    CellContextMenuProps & { isEditMode: boolean }
> = ({ isEditMode, children, cell }) => {
    const { addFilter } = useFilters();
    const meta = cell.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const { track } = useTracking();
    const { viewData } = useUnderlyingDataContext();

    if (item) {
        const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
        return (
            <ContextMenu2
                content={
                    <Menu>
                        <MenuItem
                            text={`View underlying data`}
                            icon={'layers'}
                            onClick={(e) => {
                                viewData(value, meta, cell.row.original || {});
                            }}
                        />
                        {isEditMode &&
                            isField(item) &&
                            isFilterableField(item) && (
                                <MenuItem
                                    icon={'filter'}
                                    text={`Filter by "${value.formatted}"`}
                                    onClick={() => {
                                        track({
                                            name: EventName.ADD_FILTER_CLICKED,
                                        });
                                        addFilter(
                                            item,
                                            value.raw === undefined
                                                ? null
                                                : value.raw,
                                            true,
                                        );
                                    }}
                                />
                            )}
                    </Menu>
                }
            >
                {children}
            </ContextMenu2>
        );
    }
    return <>{children}</>;
};
