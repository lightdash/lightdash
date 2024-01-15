import { subject } from '@casl/ability';
import { hasCustomDimension, ResultValue } from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { FC, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import MantineIcon from '../common/MantineIcon';
import { isBigNumberVisualizationConfig } from '../LightdashVisualization/VisualizationBigNumberConfig';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

const BigNumberContextMenu: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const clipboard = useClipboard({ timeout: 200 });
    const { showToastSuccess } = useToaster();
    const { resultsData, visualizationConfig, itemsMap } =
        useVisualizationContext();
    const { openUnderlyingDataModal, openDrillDownModal, metricQuery } =
        useMetricQueryDataContext();

    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const isBigNumber = isBigNumberVisualizationConfig(visualizationConfig);

    const fieldValues: Record<string, ResultValue> = useMemo(() => {
        return mapValues(resultsData?.rows?.[0], (col) => col.value) ?? {};
    }, [resultsData]);

    const item = useMemo(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        return chartConfig.getField(chartConfig.selectedField);
    }, [visualizationConfig, isBigNumber]);

    const value = useMemo(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        if (chartConfig.selectedField) {
            return fieldValues[chartConfig.selectedField];
        }
    }, [fieldValues, visualizationConfig, isBigNumber]);

    const handleCopyToClipboard = () => {
        if (!value) return;
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    };

    const handleViewUnderlyingData = useCallback(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        if (!itemsMap || chartConfig.selectedField === undefined || !value) {
            return;
        }

        openUnderlyingDataModal({ item, value, fieldValues });
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    }, [
        projectUuid,
        itemsMap,
        value,
        item,
        fieldValues,
        track,
        openUnderlyingDataModal,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
        isBigNumber,
        visualizationConfig,
    ]);

    const handleOpenDrillIntoModal = useCallback(() => {
        if (!item) return;

        openDrillDownModal({ item, fieldValues });
        track({
            name: EventName.DRILL_BY_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    }, [
        item,
        fieldValues,
        openDrillDownModal,
        projectUuid,
        track,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
    ]);

    if (!item && !value) return <>{children}</>;

    return (
        <Menu
            withArrow
            withinPortal
            shadow="md"
            position="bottom"
            closeOnItemClick
            closeOnEscape
            radius={0}
            offset={-2}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                {value && (
                    <Menu.Item
                        icon={<MantineIcon icon={IconCopy} />}
                        onClick={handleCopyToClipboard}
                    >
                        Copy value
                    </Menu.Item>
                )}

                {item && !hasCustomDimension(metricQuery) && (
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

                {item && value && (
                    <Can
                        I="manage"
                        this={subject('Explore', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Menu.Item
                            icon={<MantineIcon icon={IconArrowBarToDown} />}
                            onClick={handleOpenDrillIntoModal}
                        >
                            Drill into{' '}
                            <Text span fw={500}>
                                {value.formatted}
                            </Text>
                        </Menu.Item>
                    </Can>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default BigNumberContextMenu;
