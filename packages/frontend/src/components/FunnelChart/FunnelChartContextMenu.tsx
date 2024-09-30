import { subject } from '@casl/ability';
import {
    hasCustomDimension,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { Box, Menu, Portal, type MenuProps } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconStack } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { isFunnelVisualizationConfig } from '../LightdashVisualization/VisualizationConfigFunnel';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

export type FunnelChartContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    value?: ResultValue;
    rows?: ResultRow[];
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const FunnelChartContextMenu: FC<FunnelChartContextMenuProps> = ({
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
    const { visualizationConfig } = useVisualizationContext();

    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const tracking = useTracking(true);
    const metricQueryData = useMetricQueryDataContext(true);

    if (!value || !tracking || !metricQueryData || !project) {
        return null;
    }

    const { openUnderlyingDataModal, metricQuery } = metricQueryData;
    const { track } = tracking;

    if (!isFunnelVisualizationConfig(visualizationConfig)) return null;

    const { chartConfig } = visualizationConfig;

    const canViewUnderlyingData = user.data?.ability?.can(
        'view',
        subject('UnderlyingData', {
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
        if (!chartConfig.selectedField || !rows) return;

        const fieldValues = Object.keys(rows[0]).reduce<
            Record<string, ResultValue>
        >((acc, key) => {
            return { ...acc, [key]: rows[0][key].value };
        }, {});

        openUnderlyingDataModal({
            item: chartConfig.selectedField,
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
    };

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withinPortal
            shadow="md"
            closeOnItemClick
            closeOnEscape
            radius={0}
            position="right-start"
            offset={{
                mainAxis: 0,
                crossAxis: 0,
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
                    icon={<MantineIcon icon={IconCopy} />}
                    onClick={handleCopy}
                >
                    Copy value
                </Menu.Item>

                {canViewUnderlyingData && !hasCustomDimension(metricQuery) ? (
                    <Menu.Item
                        icon={<MantineIcon icon={IconStack} />}
                        onClick={handleOpenUnderlyingDataModal}
                    >
                        View underlying data
                    </Menu.Item>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
};

export default FunnelChartContextMenu;
