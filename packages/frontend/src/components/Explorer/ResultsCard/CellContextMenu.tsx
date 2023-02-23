import { Menu, MenuDivider, MenuItem } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import {
    Field,
    isDimension,
    isField,
    isFilterableField,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useParams } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFilters } from '../../../hooks/useFilters';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { CellContextMenuProps } from '../../common/Table/types';
import DrillDownMenuItem from '../../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../../MetricQueryData/MetricQueryDataProvider';
import UrlMenuItems from './UrlMenuItems';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell' | 'isEditMode'> & {
        itemsMap: Record<string, Field | TableCalculation>;
    }
> = ({ cell, isEditMode, itemsMap }) => {
    const { addFilter } = useFilters();
    const { openUnderlyingDataModel } = useMetricQueryDataContext();
    const { track } = useTracking();
    const { showToastSuccess } = useToaster();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    return (
        <Menu>
            {!!value.raw && isField(item) && (
                <UrlMenuItems
                    urls={item.urls}
                    cell={cell}
                    itemsMap={itemsMap}
                />
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

            {item && !isDimension(item) && (
                <MenuItem2
                    text="View underlying data"
                    icon="layers"
                    onClick={() => {
                        openUnderlyingDataModel(
                            value,
                            meta,
                            cell.row.original || {},
                        );
                        track({
                            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                            properties: {
                                organizationId: user?.data?.organizationUuid,
                                userId: user?.data?.userUuid,
                                projectId: projectUuid,
                            },
                        });
                    }}
                />
            )}

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
            <DrillDownMenuItem
                row={cell.row.original || {}}
                selectedItem={item}
            />
        </Menu>
    );
};

export default CellContextMenu;
