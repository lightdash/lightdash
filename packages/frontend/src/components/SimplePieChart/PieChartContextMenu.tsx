import { subject } from '@casl/ability';
import {
    getItemId,
    PivotValue,
    ResultRow,
    ResultValue,
} from '@lightdash/common';
import { Box, Menu, MenuProps, Portal } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import useDashboardFiltersForExplore from '../../hooks/dashboard/useDashboardFiltersForExplore';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

export type PieChartContextMenuProps = {
    tileUuid?: string;
    menuPosition?: {
        left: number;
        top: number;
    };
    value?: ResultValue;
    rows?: ResultRow[];
} & Pick<MenuProps, 'position' | 'opened' | 'onOpen' | 'onClose'>;

const PieChartContextMenu: FC<PieChartContextMenuProps> = ({
    tileUuid,
    menuPosition,
    value,
    rows,
    opened,
    onOpen,
    onClose,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const { explore, pieChartConfig } = useVisualizationContext();
    const dashboardFiltersThatApplyToChart = useDashboardFiltersForExplore(
        tileUuid,
        explore,
        true,
    );
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const tracking = useTracking(true);
    const metricQueryData = useMetricQueryDataContext(true);

    if (!value || !tracking || !metricQueryData || !project) {
        return null;
    }

    const { openUnderlyingDataModal /*, openDrillDownModel */ } =
        metricQueryData;
    const { track } = tracking;

    const canViewUnderlyingData = user.data?.ability?.can(
        'view',
        subject('UnderlyingData', {
            organizationUuid: project?.organizationUuid,
            projectUuid: project?.projectUuid,
        }),
    );

    const canViewDrillInto =
        // TODO: implement this
        false &&
        user.data?.ability?.can(
            'manage',
            subject('Explore', {
                organizationUuid: project?.organizationUuid,
                projectUuid: project?.projectUuid,
            }),
        );

    const handleCopy = () => {
        if (value) {
            clipboard.copy(value.formatted);
            showToastSuccess({
                title: 'Copied to clipboard!',
            });
        }
    };

    const handleOpenUnderlyingDataModal = () => {
        if (!pieChartConfig.selectedMetric) return;

        openUnderlyingDataModal({
            item: pieChartConfig.selectedMetric,
            value,
            fieldValues: {},
            dashboardFilters: dashboardFiltersThatApplyToChart,
            pivotReference: {
                field: getItemId(pieChartConfig.selectedMetric),
                pivotValues: pieChartConfig.groupFieldIds
                    ?.filter((x): x is string => x !== null)
                    ?.map<PivotValue | null>((dimension) => {
                        const dimensionValue =
                            rows?.[0]?.[dimension]?.value?.raw;

                        if (dimensionValue === undefined) {
                            return null;
                        }

                        return {
                            field: dimension,
                            value: dimensionValue,
                        };
                    })
                    .filter((x): x is PivotValue => x !== null),
            },
        });

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    };

    const handleOpenDrillIntoModal = () => {
        // TODO: implement this
        // openDrillDownModel({
        //     item,
        //     fieldValues: underlyingFieldValues,
        // });
        // track({
        //     name: EventName.DRILL_BY_CLICKED,
        //     properties: {
        //         organizationId: user.data?.organizationUuid,
        //         userId: user.data?.userUuid,
        //         projectId: projectUuid,
        //     },
        // });
    };

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            radius="xs"
            offset={{
                mainAxis: 10,
            }}
        >
            <Portal>
                <Menu.Target>
                    <Box
                        sx={{ position: 'absolute', ...(menuPosition ?? {}) }}
                    />
                </Menu.Target>
            </Portal>

            <Menu.Dropdown>
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconCopy}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                    onClick={handleCopy}
                >
                    Copy
                </Menu.Item>

                {canViewUnderlyingData ? (
                    <Menu.Item
                        icon={
                            <MantineIcon
                                icon={IconStack}
                                size="md"
                                fillOpacity={0}
                            />
                        }
                        onClick={handleOpenUnderlyingDataModal}
                    >
                        View underlying data
                    </Menu.Item>
                ) : null}

                {canViewDrillInto ? (
                    <Menu.Item
                        icon={
                            <MantineIcon
                                icon={IconArrowBarToDown}
                                size="md"
                                fillOpacity={0}
                            />
                        }
                        onClick={handleOpenDrillIntoModal}
                    >
                        Drill into "{value.formatted}"
                    </Menu.Item>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
};

export default PieChartContextMenu;
