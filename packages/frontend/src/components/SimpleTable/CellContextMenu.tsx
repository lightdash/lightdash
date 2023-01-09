import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { isField, ResultRow } from '@lightdash/common';
import React, { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import useToaster from '../../hooks/toaster/useToaster';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const { openUnderlyingDataModel } = useMetricQueryDataContext();
    const { showToastSuccess } = useToaster();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};

    return (
        <Menu>
            {item && value.raw && isField(item) && (
                <UrlMenuItems urls={item.urls} cell={cell} />
            )}

            {isField(item) && (item.urls || []).length > 0 && <MenuDivider />}

            <CopyToClipboard
                text={value.formatted}
                onCopy={() => {
                    showToastSuccess({ title: 'Copied to clipboard!' });
                }}
            >
                <MenuItem2 text="Copy value" icon="duplicate" />
            </CopyToClipboard>

            <MenuItem2
                text="View underlying data"
                icon="layers"
                onClick={() => {
                    openUnderlyingDataModel(
                        value,
                        meta,
                        cell.row.original || {},
                        undefined,
                        meta?.pivotReference,
                    );
                }}
            />

            <DrillDownMenuItem
                row={cell.row.original || {}}
                pivotReference={meta?.pivotReference}
                selectedItem={item}
            />
        </Menu>
    );
};

export default CellContextMenu;
