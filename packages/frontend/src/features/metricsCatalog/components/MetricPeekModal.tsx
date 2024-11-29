import {
    assertUnreachable,
    MetricExplorerComparison,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
} from '@lightdash/common';
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
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { IconCalendar, IconInfoCircle, IconStack } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
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

    const history = useHistory();

    const [comparisonType, setComparisonType] =
        useState<MetricExplorerComparison>(MetricExplorerComparison.NONE);

    const metricQuery = useMetric({
        projectUuid,
        tableName,
        metricName,
    });

    const [dateRange, setDateRange] = useState<MetricExplorerDateRange>([
        null,
        null,
    ]);

    const comparisonParams = useMemo(():
        | MetricExplorerComparisonType
        | undefined => {
        if (!metricQuery.isSuccess) return undefined;

        switch (comparisonType) {
            case MetricExplorerComparison.NONE:
                return {
                    type: MetricExplorerComparison.NONE,
                };
            case MetricExplorerComparison.PREVIOUS_PERIOD:
                return {
                    type: MetricExplorerComparison.PREVIOUS_PERIOD,
                };
            case MetricExplorerComparison.DIFFERENT_METRIC:
                return {
                    type: MetricExplorerComparison.DIFFERENT_METRIC,
                    metricName: metricQuery.data.name,
                };
            default:
                return assertUnreachable(
                    comparisonType,
                    `Unknown comparison type: ${comparisonType}`,
                );
        }
    }, [comparisonType, metricQuery.isSuccess, metricQuery.data]);

    const metricResultsQuery = useRunMetricExplorerQuery({
        projectUuid,
        exploreName: tableName,
        metricName,
        comparison: comparisonParams,
        dateRange,
    });

    const handleClose = useCallback(() => {
        history.push(`/projects/${projectUuid}/metrics`);
        setComparisonType(MetricExplorerComparison.NONE);
        onClose();
    }, [history, onClose, projectUuid]);

    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            yOffset={100}
            scrollAreaComponent={undefined}
            size="auto"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius="lg" w="100%">
                <LoadingOverlay
                    visible={
                        metricQuery.isLoading || metricResultsQuery.isLoading
                    }
                />
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    })}
                >
                    <Group spacing="xs">
                        <Text fw={600} fz="lg" color="dark.7">
                            {metricQuery.data?.label}
                        </Text>
                        <Tooltip
                            label={metricQuery.data?.description}
                            disabled={!metricQuery.data?.description}
                        >
                            <MantineIcon
                                color="dark.3"
                                icon={IconInfoCircle}
                                size={18}
                            />
                        </Tooltip>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <Modal.Body
                    p={0}
                    h="auto"
                    sx={{ display: 'flex', flex: 1 }}
                    miw={800}
                    mih={600}
                >
                    <Stack p="xl" bg="offWhite.0" w={360}>
                        <Stack spacing="xl">
                            <Stack
                                w="100%"
                                spacing="xs"
                                align="flex-start"
                                sx={{ flexGrow: 1 }}
                            >
                                <Text fw={500} c="gray.7">
                                    Time filter
                                </Text>
                                {metricQuery.isSuccess && (
                                    <MetricPeekDatePicker
                                        defaultTimeDimension={
                                            metricQuery.data
                                                .defaultTimeDimension
                                        }
                                        onChange={setDateRange}
                                    />
                                )}
                            </Stack>

                            <Divider color="gray.2" />

                            <Stack w="100%" spacing="xs" sx={{ flexGrow: 1 }}>
                                <Group position="apart">
                                    <Text fw={500} c="gray.7">
                                        Comparison
                                    </Text>

                                    <Button
                                        variant="subtle"
                                        compact
                                        color="dark"
                                        size="xs"
                                        radius="md"
                                        sx={{
                                            visibility:
                                                comparisonType ===
                                                MetricExplorerComparison.NONE
                                                    ? 'hidden'
                                                    : 'visible',
                                        }}
                                        onClick={() =>
                                            setComparisonType(
                                                MetricExplorerComparison.NONE,
                                            )
                                        }
                                    >
                                        Clear
                                    </Button>
                                </Group>

                                <Radio.Group
                                    value={comparisonType}
                                    onChange={(
                                        value: MetricExplorerComparison,
                                    ) => setComparisonType(value)}
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
                                                p="md"
                                                sx={(theme) => ({
                                                    cursor: 'pointer',
                                                    '&[data-with-border="true"]':
                                                        {
                                                            border:
                                                                comparisonType ===
                                                                comparison.type
                                                                    ? `1px solid ${theme.colors.indigo[5]}`
                                                                    : `1px solid ${theme.colors.gray[2]}`,
                                                        },
                                                })}
                                                onClick={() =>
                                                    setComparisonType(
                                                        comparison.type,
                                                    )
                                                }
                                            >
                                                <Group align="start" noWrap>
                                                    <Paper p="xs">
                                                        <MantineIcon
                                                            icon={
                                                                comparison.icon
                                                            }
                                                        />
                                                    </Paper>

                                                    <Stack spacing={4}>
                                                        <Text
                                                            color="dark.8"
                                                            fw={500}
                                                        >
                                                            {comparison.label}
                                                        </Text>

                                                        <Text color="gray.6">
                                                            {
                                                                comparison.description
                                                            }
                                                        </Text>
                                                    </Stack>

                                                    <Radio
                                                        value={comparison.type}
                                                        size="xs"
                                                        color="indigo"
                                                    />
                                                </Group>
                                            </Paper>
                                        ))}
                                    </Stack>
                                </Radio.Group>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider orientation="vertical" color="gray.2" />

                    <Flex mih={500} p="xxl" align="center" sx={{ flexGrow: 1 }}>
                        {metricQuery.isSuccess &&
                            metricResultsQuery.isSuccess && (
                                <MetricsVisualization
                                    metric={metricQuery.data}
                                    data={metricResultsQuery.data}
                                />
                            )}
                    </Flex>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
