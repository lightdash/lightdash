import { Menu } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    FieldUrl,
    isField,
    renderTemplatedUrl,
    ResultRow,
} from '@lightdash/common';
import { FC } from 'react';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { CellContextMenuProps } from '../common/Table/types';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const { track } = useTracking();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};

    const urls: FieldUrl[] | undefined =
        value.raw && isField(item) ? item.urls : undefined;

    if (!urls) {
        return null;
    }
    return (
        <Menu>
            {urls.map((urlConfig) => (
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
        </Menu>
    );
};

export default CellContextMenu;
