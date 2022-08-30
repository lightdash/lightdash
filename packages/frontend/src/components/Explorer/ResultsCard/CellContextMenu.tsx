import { Menu } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { isField, isFilterableField, ResultRow } from '@lightdash/common';
import { FC } from 'react';
import { useFilters } from '../../../hooks/useFilters';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { isUrl } from '../../common/Table/ScrollableTable/RichBodyCell';
import { CellContextMenuProps, TableColumn } from '../../common/Table/types';
import { useUnderlyingDataContext } from '../../UnderlyingData/UnderlyingDataProvider';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell' | 'isEditMode'>
> = ({ cell, isEditMode }) => {
    const { addFilter } = useFilters();
    const { viewData } = useUnderlyingDataContext();
    const { track } = useTracking();

    const meta = cell.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

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

export default CellContextMenu;
