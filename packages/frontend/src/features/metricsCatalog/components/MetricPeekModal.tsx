import { MetricExplorerComparison } from '@lightdash/common';
import {
    Button,
    Divider,
    Flex,
    Group,
    LoadingOverlay,
    Modal,
    Paper,
    Radio,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconCalendar, IconStack } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
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

    const handleClose = useCallback(() => {
        history.push(`/projects/${projectUuid}/metrics`);
        onClose();
    }, [history, onClose, projectUuid]);

    const [comparisonType, setComparisonType] =
        useState<MetricExplorerComparison>();

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
                        <Stack p="md" bg="gray.0" w={360} spacing="sm">
                            {metricQuery.isSuccess && (
                                <MetricPeekDatePicker
                                    defaultTimeDimension={
                                        metricQuery.data.defaultTimeDimension
                                    }
                                />
                            )}

                            <Group position="apart">
                                <Text fw={500} c="gray.7">
                                    Comparison
                                </Text>

                                <Button
                                    variant="default"
                                    compact
                                    size="xs"
                                    style={{
                                        visibility: comparisonType
                                            ? 'visible'
                                            : 'hidden',
                                    }}
                                    onClick={() => setComparisonType(undefined)}
                                >
                                    Clear
                                </Button>
                            </Group>

                            <Radio.Group
                                value={comparisonType}
                                onChange={(value: MetricExplorerComparison) =>
                                    setComparisonType(value)
                                }
                            >
                                <Stack spacing="sm">
                                    {[
                                        {
                                            type: MetricExplorerComparison.PREVIOUS_PERIOD,
                                            icon: IconCalendar,
                                            label: 'Compare to previous period', // TODO: should have a label relative to the time granularity
                                            description:
                                                'Show data from the same period in the previous cycle', // TODO: should have a description relative to the time granularity
                                        },
                                        {
                                            type: MetricExplorerComparison.DIFFERENT_METRIC,
                                            icon: IconStack,
                                            label: 'Compare to another metric',
                                            description: `Compare ${
                                                metricQuery.data?.label
                                                    ? `"${metricQuery.data?.label}"`
                                                    : 'this metric'
                                            } to another metric`,
                                        },
                                    ].map((comparison) => (
                                        <Paper
                                            key={comparison.type}
                                            withBorder
                                            radius="lg"
                                            p="lg"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() =>
                                                setComparisonType(
                                                    comparison.type,
                                                )
                                            }
                                        >
                                            <Group align="start" noWrap>
                                                <Paper
                                                    p="xs"
                                                    withBorder
                                                    radius="md"
                                                    shadow="md"
                                                >
                                                    <MantineIcon
                                                        icon={comparison.icon}
                                                    />
                                                </Paper>

                                                <Stack spacing={4}>
                                                    <Text
                                                        color="dark.8"
                                                        fw={500}
                                                    >
                                                        {comparison.label}
                                                    </Text>

                                                    <Text color="gray.7">
                                                        {comparison.description}
                                                    </Text>
                                                </Stack>

                                                <Radio
                                                    value={comparison.type}
                                                />
                                            </Group>
                                        </Paper>
                                    ))}
                                </Stack>
                            </Radio.Group>
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
