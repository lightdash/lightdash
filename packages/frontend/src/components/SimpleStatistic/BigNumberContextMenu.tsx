import { subject } from '@casl/ability';
import { DashboardFilters, ResultValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash-es/mapValues';
import { FC, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useExplore } from '../../hooks/useExplore';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

export type BigNumberContextMenuProps = {
    dashboardFilters?: DashboardFilters;
};

const BigNumberContextMenu: FC<BigNumberContextMenuProps> = ({
    children,
    dashboardFilters,
}) => {
    const clipboard = useClipboard({ timeout: 200 });
    const { showToastSuccess } = useToaster();
    const { resultsData, bigNumberConfig } = useVisualizationContext();
    const { openUnderlyingDataModal, openDrillDownModal, tableName } =
        useMetricQueryDataContext();
    const { data: explore } = useExplore(tableName);

    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const fieldValues: Record<string, ResultValue> = useMemo(() => {
        return mapValues(resultsData?.rows?.[0], (col) => col.value) ?? {};
    }, [resultsData]);

    const item = useMemo(
        () => bigNumberConfig.getField(bigNumberConfig.selectedField),
        [bigNumberConfig],
    );

    const value = useMemo(() => {
        if (bigNumberConfig.selectedField) {
            return fieldValues[bigNumberConfig.selectedField];
        }
    }, [fieldValues, bigNumberConfig]);

    const handleCopy = () => {
        if (value) {
            clipboard.copy(value.formatted);
            showToastSuccess({
                title: 'Copied to clipboard!',
            });
        }
    };

    const handleViewUnderlyingData = useCallback(() => {
        if (
            explore === undefined ||
            bigNumberConfig.selectedField === undefined ||
            !value
        ) {
            return;
        }

        openUnderlyingDataModal({ item, value, fieldValues, dashboardFilters });
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
        explore,
        value,
        item,
        fieldValues,
        dashboardFilters,
        bigNumberConfig,
        track,
        openUnderlyingDataModal,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
    ]);

    const handleOpenDrillIntoModal = useCallback(() => {
        if (!item) return;

        openDrillDownModal({ item, fieldValues, dashboardFilters });
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
        dashboardFilters,
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
            radius="xs"
            offset={-5}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                {value && (
                    <Menu.Item
                        icon={<MantineIcon icon={IconCopy} />}
                        onClick={handleCopy}
                    >
                        Copy value
                    </Menu.Item>
                )}

                {item && (
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
                            Drill into "{value.formatted}"
                        </Menu.Item>
                    </Can>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default BigNumberContextMenu;
