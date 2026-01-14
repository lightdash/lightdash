import { Anchor, List, Stack, Text } from '@mantine-8/core';
import { IconDeviceAnalytics } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricChartAnalytics } from '../hooks/useMetricChartAnalytics';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

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

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Metric Usage"
            icon={IconDeviceAnalytics}
            cancelLabel={false}
        >
            <Stack gap="xs">
                <Text>This metric is used in the following charts:</Text>
                {isLoading ? (
                    <Text size="sm" c="dimmed">
                        Loading...
                    </Text>
                ) : analytics?.charts.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No charts found using this metric
                    </Text>
                ) : (
                    <List pl="sm">
                        {analytics?.charts.map((chart) => (
                            <List.Item key={chart.uuid} fz="sm">
                                <Anchor
                                    href={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                    target="_blank"
                                    onClick={() => {
                                        track({
                                            name: EventName.METRICS_CATALOG_CHART_USAGE_CHART_CLICKED,
                                            properties: {
                                                userId: userUuid,
                                                organizationId:
                                                    organizationUuid,
                                                projectId: projectUuid,
                                                metricName: activeMetric?.name,
                                                tableName:
                                                    activeMetric?.tableName,
                                                chartId: chart.uuid,
                                            },
                                        });
                                    }}
                                >
                                    {chart.name}
                                </Anchor>
                            </List.Item>
                        ))}
                    </List>
                )}
            </Stack>
        </MantineModal>
    );
};
