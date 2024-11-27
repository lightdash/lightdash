import {
    Divider,
    Flex,
    Group,
    LoadingOverlay,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { Hash } from '../../../svgs/metricsCatalog';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useRunMetricExplorerQuery } from '../hooks/useRunMetricExplorerQuery';
import { MetricPeekDatePicker } from './MetricPeekDatePicker';
import MetricsVisualization from './MetricsVisualization';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const MetricPeekModal: FC<Props> = ({ opened, onClose }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const metricQuery = useMetric({
        projectUuid,
        tableName,
        metricName,
    });

    const metricResultsQuery = useRunMetricExplorerQuery({
        projectUuid,
        exploreName: tableName,
        metricName,
    });

    const history = useHistory();

    const handleClose = () => {
        history.push(`/projects/${projectUuid}/metrics`);
        onClose();
    };

    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            yOffset={150}
            scrollAreaComponent={undefined}
            size="80%"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius="md">
                <LoadingOverlay
                    visible={
                        metricQuery.isLoading || metricResultsQuery.isLoading
                    }
                />
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[4]}`,
                    })}
                >
                    <Group spacing="xs">
                        <Hash />
                        <Text fw={500}>Metric Details</Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <Modal.Body p={0}>
                    <Flex align="stretch" gap={0}>
                        <Stack p="md" bg="gray.0" w={360}>
                            <Text fw={500} fz="lg">
                                {metricQuery.data?.label}
                            </Text>

                            {metricQuery.isSuccess && (
                                <MetricPeekDatePicker
                                    defaultTimeDimension={
                                        metricQuery.data.defaultTimeDimension
                                    }
                                />
                            )}
                        </Stack>

                        <Divider orientation="vertical" />

                        <Stack style={{ flexGrow: 1 }}>
                            {metricQuery.isSuccess &&
                                metricResultsQuery.isSuccess && (
                                    <MetricsVisualization
                                        metric={metricQuery.data}
                                        data={metricResultsQuery.data}
                                    />
                                )}
                        </Stack>
                    </Flex>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
