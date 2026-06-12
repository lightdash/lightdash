import { subject } from '@casl/ability';
import {
    hasCustomBinDimension,
    isCustomDimension,
    isDimension,
    isDimensionValueInvalidDate,
    isField,
    isFilterableField,
    type Field,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { Menu, Text } from '@mantine-8/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconFilter, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useCallback, useMemo, type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFilters } from '../../../hooks/useFilters';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { JsonCellMenuItem } from '../../common/JsonViewer/JsonCellViewer';
import {
    getJsonCellValue,
    getJsonLikeString,
} from '../../common/JsonViewer/utils';
import MantineIcon from '../../common/MantineIcon';
import { type CellContextMenuProps } from '../../common/Table/types';
import DrillDownMenuItem from '../../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../../MetricQueryData/useMetricQueryDataContext';
import UrlMenuItems from './UrlMenuItems';

const MAX_FILTER_VALUE_LABEL_LENGTH = 40;

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell' | 'isEditMode' | 'onViewJsonCell'> & {
        itemsMap: Record<string, Field | TableCalculation>;
        onExpand: (name: string, data: object) => void;
    }
> = ({ cell, isEditMode, itemsMap, onViewJsonCell }) => {
    const { addFilter } = useFilters();
    const { openUnderlyingDataModal, metricQuery, resolvedTimezone } =
        useMetricQueryDataContext();
    const { track } = useTracking();
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 2000 });
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;
    const { user } = useApp();
    const projectUuid = useProjectUuid();

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

        addFilter(item, filterValue, resolvedTimezone);
    }, [track, addFilter, item, value, resolvedTimezone]);

    const jsonValue =
        getJsonCellValue(value.raw) ?? getJsonLikeString(value.raw);
    const filterValueLabel =
        value.formatted.length > MAX_FILTER_VALUE_LABEL_LENGTH
            ? `${value.formatted.slice(0, MAX_FILTER_VALUE_LABEL_LENGTH)}...`
            : value.formatted;

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
                leftSection={<MantineIcon icon={IconCopy} />}
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>
            {jsonValue && onViewJsonCell && (
                <JsonCellMenuItem onClick={() => onViewJsonCell(jsonValue)} />
            )}
            {item &&
                !isDimension(item) &&
                !isCustomDimension(item) &&
                !hasCustomBinDimension(metricQuery) && (
                    <Can
                        I="view"
                        this={subject('UnderlyingData', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconStack} />}
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
                        leftSection={<MantineIcon icon={IconFilter} />}
                        onClick={handleFilterByValue}
                        style={{ maxWidth: 360 }}
                    >
                        <Text
                            span
                            fz="inherit"
                            lh="inherit"
                            style={{
                                display: 'block',
                                maxWidth: '100%',
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <Text span fz="inherit" lh="inherit">
                                Filter by&nbsp;
                            </Text>
                            <Text
                                span
                                fz="inherit"
                                lh="inherit"
                                fw="bold"
                                title={value.formatted}
                                style={{
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {filterValueLabel}
                            </Text>
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
