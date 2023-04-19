import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2, Popover2Props } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import mapValues from 'lodash-es/mapValues';
import { FC, useCallback, useMemo } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useParams } from 'react-router-dom';

import useToaster from '../../hooks/toaster/useToaster';
import { useExplore } from '../../hooks/useExplore';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import {
    UnderlyingValueMap,
    useMetricQueryDataContext,
} from '../MetricQueryData/MetricQueryDataProvider';

interface BigNumberContextMenuProps {
    renderTarget: Popover2Props['renderTarget'];
}

export const BigNumberContextMenu: FC<BigNumberContextMenuProps> = ({
    renderTarget,
}) => {
    const { showToastSuccess } = useToaster();
    const { resultsData, bigNumberConfig } = useVisualizationContext();
    const { openUnderlyingDataModal, tableName } = useMetricQueryDataContext();
    const { data: explore } = useExplore(tableName);

    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const selectedItem = useMemo(
        () =>
            bigNumberConfig?.selectedField
                ? bigNumberConfig.getField(bigNumberConfig.selectedField)
                : undefined,
        [bigNumberConfig],
    );

    const fieldValues: UnderlyingValueMap = useMemo(() => {
        return mapValues(resultsData?.rows?.[0], (r) => r.value) ?? {};
    }, [resultsData]);

    const value = useMemo(() => {
        if (bigNumberConfig.selectedField) {
            return fieldValues[bigNumberConfig.selectedField];
        }
    }, [fieldValues, bigNumberConfig]);

    const viewUnderlyingData = useCallback(() => {
        if (
            explore !== undefined &&
            bigNumberConfig.selectedField !== undefined &&
            value
        ) {
            const item = bigNumberConfig.getField(
                bigNumberConfig.selectedField,
            );

            openUnderlyingDataModal({ item, value, fieldValues });
            track({
                name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                properties: {
                    organizationId: user?.data?.organizationUuid,
                    userId: user?.data?.userUuid,
                    projectId: projectUuid,
                },
            });
        }
    }, [
        projectUuid,
        explore,
        value,
        fieldValues,
        bigNumberConfig,
        track,
        openUnderlyingDataModal,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
    ]);

    return (
        <Popover2
            lazy
            minimal
            position={Position.BOTTOM}
            renderTarget={renderTarget}
            content={
                <Menu>
                    {value && (
                        <CopyToClipboard
                            text={value.formatted}
                            onCopy={() => {
                                showToastSuccess({
                                    title: 'Copied to clipboard!',
                                });
                            }}
                        >
                            <MenuItem2 text="Copy value" icon="duplicate" />
                        </CopyToClipboard>
                    )}
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
                                viewUnderlyingData();
                            }}
                        />
                    </Can>
                    <Can
                        I="manage"
                        this={subject('Explore', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <DrillDownMenuItem
                            item={selectedItem}
                            fieldValues={resultsData?.rows[0].value}
                            trackingData={{
                                organizationId: user?.data?.organizationUuid,
                                userId: user?.data?.userUuid,
                                projectId: projectUuid,
                            }}
                        />
                    </Can>
                </Menu>
            }
        />
    );
};
