import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ResultRow, isField, renderTemplatedUrl } from '@lightdash/common';
import { FC } from 'react';
import { CellContextMenuProps } from '../common/Table/types';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const { track } = useTracking();
    const { viewData } = useUnderlyingDataContext();
    
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    const pivot = meta?.pivotReference?.pivotValues?.[0]
        ? {
              fieldId: meta?.pivotReference?.pivotValues?.[0].field,
              value: meta?.pivotReference?.pivotValues?.[0].value,
          }
        : undefined;

    return (
        <Menu>
            {item &&
                value.raw &&
                isField(item) &&
                (item.urls || []).map((urlConfig) => (
                    <MenuItem2
                        key={`url_entry_${urlConfig.label}`}
                        icon="open-application"
                        text={urlConfig.label}
                        onClick={() => {
                            track({
                                name: EventName.GO_TO_LINK_CLICKED,
                            });
                            window.open(
                                renderTemplatedUrl(urlConfig.url, {
                                    raw: value.raw,
                                    formatted: value.formatted,
                                }),
                                '_blank',
                            );
                        }}
                    />
                ))}
            {isField(item) && (item.urls || []).length > 0 && <MenuDivider />}
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

export default CellContextMenu;
