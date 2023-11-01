import { Menu, MenuDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    hasCustomDimension,
    isCustomDimension,
    isDimension,
    isField,
    ResultValue,
} from '@lightdash/common';
import mapValues from 'lodash-es/mapValues';
import React, { FC } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import { CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();
    const { showToastSuccess } = useToaster();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = cell.getValue()?.value || {};
    const fieldValues = mapValues(cell.row.original, (v) => v?.value) || {};

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
        </Menu>
    );
};

export default CellContextMenu;
