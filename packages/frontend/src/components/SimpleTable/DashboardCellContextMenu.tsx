import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    DashboardFilterRule,
    Explore,
    fieldId,
    FilterOperator,
    friendlyName,
    getFields,
    getItemId,
    hasCustomDimension,
    isDimension,
    isField,
    ResultValue,
} from '@lightdash/common';
import { uuid4 } from '@sentry/utils';
import mapValues from 'lodash-es/mapValues';
import { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const DashboardCellContextMenu: FC<
    Pick<CellContextMenuProps, 'cell'> & {
        explore: Explore | undefined;
    }
> = ({ cell, explore }) => {
    const { showToastSuccess } = useToaster();
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();

    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );

    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = cell.getValue()?.value || {};
    const fieldValues = mapValues(cell.row.original, (v) => v?.value) || {};

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

    const fields = explore && getFields(explore);

    const possiblePivotFilters = (
        meta?.pivotReference?.pivotValues || []
    ).map<DashboardFilterRule>((pivot) => {
        const pivotField = fields?.find(
            (field) => getItemId(field) === pivot?.field,
        );
        return {
            id: uuid4(),
            target: {
                fieldId: pivot.field,
                tableName: pivotField?.table || '',
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

            {item && !isDimension(item) && !hasCustomDimension(metricQuery) && (
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
                            track({
                                name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                                properties: {
                                    organizationId:
                                        user?.data?.organizationUuid,
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
                <MenuItem2 icon="filter" text="Filter dashboard to...">
                    {filters.map((filter) => {
                        return (
                            <MenuItem2
                                key={filter.id}
                                text={`${friendlyName(
                                    filter.target.fieldId,
                                )} is ${filter.values && filter.values[0]}`}
                                onClick={() => {
                                    addDimensionDashboardFilter(filter, true);
                                }}
                            />
                        );
                    })}
                </MenuItem2>
            )}
        </Menu>
    );
};

export default DashboardCellContextMenu;
