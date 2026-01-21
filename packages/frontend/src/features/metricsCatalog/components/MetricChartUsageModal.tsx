import { type ApiCatalogAnalyticsResults } from '@lightdash/common';
import { Avatar, Box, Group, Stack, Text } from '@mantine-8/core';
import {
    IconDeviceAnalytics,
    IconEye,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import { getChartIcon } from '../../../components/common/ResourceIcon/utils';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricChartAnalytics } from '../hooks/useMetricChartAnalytics';
import styles from './MetricChartUsageModal.module.css';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

type ChartListProps = {
    projectUuid: string;
    analytics: ApiCatalogAnalyticsResults;
    onChartClick: (chartUuid: string) => void;
};

const ChartList: FC<ChartListProps> = ({
    projectUuid,
    analytics,
    onChartClick,
}) => {
    return (
        <Stack gap={0}>
            {analytics.charts.map((chart) => (
                <Box
                    key={chart.uuid}
                    component={Link}
                    to={`/projects/${projectUuid}/saved/${chart.uuid}`}
                    target="_blank"
                    className={styles.chartRow}
                    onClick={() => onChartClick(chart.uuid)}
                >
                    <Avatar size="sm" color="blue" radius="xl">
                        <MantineIcon icon={getChartIcon(chart.chartKind)} />
                    </Avatar>
                    <Stack gap={2} miw={0}>
                        <Text fz="sm" fw={500}>
                            {chart.name}
                        </Text>
                        {chart.description && (
                            <Text fz="xs" c="dimmed" lineClamp={2}>
                                {chart.description}
                            </Text>
                        )}
                        <Group gap={4} wrap="nowrap">
                            <MantineIcon
                                color="ldGray.6"
                                icon={IconFolder}
                                size={14}
                            />
                            <Text fz="xs" c="ldGray.6">
                                {chart.spaceName}
                            </Text>
                            {chart.dashboardUuid && (
                                <>
                                    <Text c="ldGray.6" fz="xs">
                                        /
                                    </Text>
                                    <MantineIcon
                                        color="ldGray.6"
                                        icon={IconLayoutDashboard}
                                        size={14}
                                    />
                                    <Text fz="xs" c="ldGray.6">
                                        {chart.dashboardName}
                                    </Text>
                                </>
                            )}
                            {chart.viewsCount !== undefined && (
                                <>
                                    <Text c="ldGray.6" fz="xs">
                                        ·
                                    </Text>
                                    <MantineIcon
                                        color="ldGray.6"
                                        icon={IconEye}
                                        size={14}
                                    />
                                    <Text fz="xs" c="ldGray.6">
                                        {chart.viewsCount}
                                    </Text>
                                </>
                            )}
                        </Group>
                    </Stack>
                </Box>
            ))}
        </Stack>
    );
};

export const MetricChartUsageModal: FC<Props> = ({ opened, onClose }) => {
    const { track } = useTracking();
    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );
    const activeMetric = useAppSelector(
        (state) => state.metricsCatalog.activeMetric,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );

    const { data: analytics, isLoading } = useMetricChartAnalytics({
        projectUuid,
        table: activeMetric?.tableName,
        field: activeMetric?.name,
    });

    const handleChartClick = (chartUuid: string) => {
        track({
            name: EventName.METRICS_CATALOG_CHART_USAGE_CHART_CLICKED,
            properties: {
                userId: userUuid,
                organizationId: organizationUuid,
                projectId: projectUuid,
                metricName: activeMetric?.name,
                tableName: activeMetric?.tableName,
                chartId: chartUuid,
            },
        });
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Metric Usage"
            icon={IconDeviceAnalytics}
            cancelLabel={false}
            size="xl"
        >
            <Stack gap="sm">
                {isLoading ? (
                    <Text size="sm" c="dimmed">
                        Loading...
                    </Text>
                ) : !analytics || analytics.charts.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No charts found using this metric
                    </Text>
                ) : (
                    <ChartList
                        projectUuid={projectUuid!}
                        analytics={analytics}
                        onChartClick={handleChartClick}
                    />
                )}
            </Stack>
        </MantineModal>
    );
};
