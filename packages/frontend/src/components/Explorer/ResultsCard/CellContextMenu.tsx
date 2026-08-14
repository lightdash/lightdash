import { subject } from '@casl/ability';
import {
    hasCustomBinDimension,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableField,
    type Field,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useCallback, useMemo, type FC } from 'react';
import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import { useMergeQuickFilter } from '../../../features/mergeQuery/hooks/useMergeQuickFilter';
import useToaster from '../../../hooks/toaster/useToaster';
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
import QuickFilterMenuItems from '../QuickFilterMenuItems';
import UrlMenuItems from './UrlMenuItems';

const CellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell' | 'isEditMode' | 'onViewJsonCell'> & {
        itemsMap: Record<string, Field | TableCalculation>;
        onExpand: (name: string, data: object) => void;
    }
> = ({ cell, isEditMode, itemsMap, onViewJsonCell }) => {
    const merge = useMergeSafe();
    const isMerged = !!merge?.mergeResults;
    const mergeQuickFilter = useMergeQuickFilter();
    const { openUnderlyingDataModal, metricQuery } =
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

    const jsonValue =
        getJsonCellValue(value.raw) ?? getJsonLikeString(value.raw);

    return (
        <>
            {value.raw !== undefined && value.raw !== null && isField(item) && (
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
                !hasCustomBinDimension(metricQuery) &&
                // A merged column descends from one of two queries, and
                // nothing here knows which. Offering the drill would run it
                // against an explore that does not exist.
                !isMerged && (
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
                {isEditMode &&
                    item &&
                    isFilterableField(item) &&
                    (!isMerged || mergeQuickFilter.canFilter(item)) && (
                        <QuickFilterMenuItems
                            item={item}
                            value={value}
                            onAddFilter={
                                isMerged
                                    ? mergeQuickFilter.addFilter
                                    : undefined
                            }
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
        </>
    );
};

export default CellContextMenu;
