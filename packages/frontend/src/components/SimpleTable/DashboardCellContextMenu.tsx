import { subject } from '@casl/ability';
import {
    DashboardFilterRule,
    fieldId,
    FilterOperator,
    friendlyName,
    hasCustomDimension,
    isDimension,
    isField,
    ItemsMap,
    ResultValue,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { uuid4 } from '@sentry/utils';
import { IconCopy, IconFilter, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { FC, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import MantineIcon from '../common/MantineIcon';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const DashboardCellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell'> & {
        itemsMap: ItemsMap | undefined;
    }
> = ({ cell, itemsMap }) => {
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();

    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );

    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const fieldValues = useMemo(
        () => mapValues(cell.row.original, (v) => v?.value) || {},
        [cell.row.original],
    );

    const filterField =
        isDimension(item) && !item.hidden
            ? [
                  {
                      id: uuid4(),
                      target: {
                          fieldId: fieldId(item),
                          tableName: item.table,
                      },
                      operator: FilterOperator.EQUALS,
                      values: [value.raw],
                      label: undefined,
                  },
              ]
            : [];

    const possiblePivotFilters = (
        meta?.pivotReference?.pivotValues || []
    ).map<DashboardFilterRule>((pivot) => {
        const pivotField = itemsMap?.[pivot?.field];
        return {
            id: uuid4(),
            target: {
                fieldId: pivot.field,
                tableName: isField(pivotField) ? pivotField?.table : '',
            },
            operator: FilterOperator.EQUALS,
            values: [pivot.value],
            label: undefined,
        };
    });
    const filters: DashboardFilterRule[] = [
        ...filterField,
        ...possiblePivotFilters,
    ];

    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [value, clipboard, showToastSuccess]);

    const handleViewUnderlyingData = useCallback(() => {
        if (meta === undefined) return;

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });

        openUnderlyingDataModal({
            item: meta.item,
            value,
            fieldValues,
            pivotReference: meta?.pivotReference,
        });
    }, [
        track,
        user,
        projectUuid,
        openUnderlyingDataModal,
        meta,
        value,
        fieldValues,
    ]);

    return (
        <>
            {item && value.raw && isField(item) && (
                <UrlMenuItems urls={item.urls} cell={cell} />
            )}

            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}

            <Menu.Item
                icon={<MantineIcon icon={IconCopy} />}
                onClick={handleCopyToClipboard}
            >
                Copy value
            </Menu.Item>

            {item && !isDimension(item) && !hasCustomDimension(metricQuery) && (
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
                <DrillDownMenuItem
                    item={item}
                    fieldValues={fieldValues}
                    pivotReference={meta?.pivotReference}
                    trackingData={{
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    }}
                />
            </Can>

            {filters.length > 0 && (
                <>
                    <Menu.Divider />
                    <Menu.Label>Filter dashboard to...</Menu.Label>

                    {filters.map((filter) => (
                        <Menu.Item
                            key={filter.id}
                            icon={<MantineIcon icon={IconFilter} />}
                            onClick={() =>
                                addDimensionDashboardFilter(filter, true)
                            }
                        >
                            {friendlyName(filter.target.fieldId)} is{' '}
                            <Text span fw={500}>
                                {filter.values &&
                                    filter.values[0] &&
                                    String(filter.values[0])}
                            </Text>
                        </Menu.Item>
                    ))}
                </>
            )}
        </>
    );
};

export default DashboardCellContextMenu;
