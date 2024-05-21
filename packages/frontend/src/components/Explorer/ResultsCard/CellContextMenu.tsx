import { subject } from '@casl/ability';
import {
    hasCustomDimension,
    isCustomDimension,
    isDimension,
    isDimensionValueInvalidDate,
    isField,
    isFilterableField,
    type Field,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconEye, IconFilter, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFilters } from '../../../hooks/useFilters';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { Can } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import { type CellContextMenuProps } from '../../common/Table/types';
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
    const clipboard = useClipboard({ timeout: 2000 });
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const fieldValues = useMemo(
        () => mapValues(cell.row.original, (v) => v?.value) || {},
        [cell.row.original],
    );

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [value, clipboard, showToastSuccess]);

    const handleViewUnderlyingData = useCallback(() => {
        if (meta?.item === undefined) return;

        openUnderlyingDataModal({
            item: meta.item,
            value,
            fieldValues,
        });
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    }, [
        openUnderlyingDataModal,
        meta,
        value,
        fieldValues,
        track,
        user,
        projectUuid,
    ]);

    const handleFilterByValue = useCallback(() => {
        if (!item || !isFilterableField(item)) return;

        track({
            name: EventName.ADD_FILTER_CLICKED,
        });

        const filterValue =
            value.raw === undefined || isDimensionValueInvalidDate(item, value)
                ? null // Set as null if value is invalid date or undefined
                : value.raw;

        addFilter(item, filterValue, true);
    }, [track, addFilter, item, value]);

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
        <>
            {!!value.raw && isField(item) && (
                <UrlMenuItems
                    urls={item.urls}
                    cell={cell}
                    itemsMap={itemsMap}
                />
            )}
            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}
            <Menu.Item
                icon={<MantineIcon icon={IconCopy} />}
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>
            {parseResult !== null && (
                <Menu.Item
                    icon={<MantineIcon icon={IconEye} />}
                    onClick={() =>
                        onExpand(
                            item && 'displayName' in item
                                ? item.displayName
                                : item?.name || '',
                            parseResult || {},
                        )
                    }
                >
                    Expand
                </Menu.Item>
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
                        <Menu.Item
                            icon={<MantineIcon icon={IconStack} />}
                            onClick={handleViewUnderlyingData}
                        >
                            View underlying data
                        </Menu.Item>
                    </Can>
                )}
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                {isEditMode && item && isFilterableField(item) && (
                    <Menu.Item
                        icon={<MantineIcon icon={IconFilter} />}
                        onClick={handleFilterByValue}
                    >
                        Filter by{' '}
                        <Text span fw={500}>
                            {value.formatted}
                        </Text>
                    </Menu.Item>
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
        </>
    );
};

export default CellContextMenu;
