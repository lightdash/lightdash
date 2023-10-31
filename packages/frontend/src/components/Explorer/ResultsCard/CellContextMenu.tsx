import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    Field,
    hasCustomDimension,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableField,
    ResultValue,
    TableCalculation,
} from '@lightdash/common';
import mapValues from 'lodash-es/mapValues';
import { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useParams } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFilters } from '../../../hooks/useFilters';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { Can } from '../../common/Authorization';
import { CellContextMenuProps } from '../../common/Table/types';
import DrillDownMenuItem from '../../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../../MetricQueryData/MetricQueryDataProvider';
import UrlMenuItems from './UrlMenuItems';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell' | 'isEditMode'> & {
        itemsMap: Record<string, Field | TableCalculation>;
        onExpand: (name: string, data: object) => void;
    }
> = ({ cell, isEditMode, itemsMap, onExpand }) => {
    const { addFilter } = useFilters();
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();
    const { track } = useTracking();
    const { showToastSuccess } = useToaster();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const value: ResultValue = cell.getValue()?.value || {};
    const fieldValues = mapValues(cell.row.original, (v) => v?.value) || {};

    let parseResult: null | object = null;
    if (
        !!value.raw &&
        typeof value.raw === 'string' &&
        (value.raw.startsWith('{') || value.raw.startsWith('['))
    ) {
        try {
            parseResult = JSON.parse(String(value.raw));
        } catch {
            // Do nothing
        }
    }

    return (
        <Menu style={{ maxWidth: 500 }}>
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

            {parseResult !== null && (
                <MenuItem2
                    text="Expand"
                    icon="eye-open"
                    onClick={() =>
                        onExpand(
                            item && 'displayName' in item
                                ? item.displayName
                                : item?.name || '',
                            parseResult || {},
                        )
                    }
                />
            )}

            {item &&
                !isDimension(item) &&
                !isCustomDimension(item) &&
                !hasCustomDimension(metricQuery) && (
                    <Can
                        I="view"
                        this={subject('UnderlyingData', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <MenuItem2
                            text="View underlying data"
                            icon="layers"
                            onClick={() => {
                                openUnderlyingDataModal({
                                    item: meta.item,
                                    value,
                                    fieldValues,
                                });
                                track({
                                    name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                                    properties: {
                                        organizationId:
                                            user?.data?.organizationUuid,
                                        userId: user?.data?.userUuid,
                                        projectId: projectUuid,
                                    },
                                });
                            }}
                        />
                    </Can>
                )}
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
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
                    item={item}
                    fieldValues={fieldValues}
                    trackingData={{
                        organizationId: user.data?.organizationUuid,
                        userId: user.data?.userUuid,
                        projectId: projectUuid,
                    }}
                />
            </Can>
        </Menu>
    );
};

export default CellContextMenu;
