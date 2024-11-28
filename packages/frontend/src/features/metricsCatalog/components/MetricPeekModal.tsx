import {
    Box,
    Center,
    Checkbox,
    Divider,
    Group,
    LoadingOverlay,
    Modal,
    Paper,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import {
    IconCalendar,
    IconChartArcs3,
    IconInfoCircle,
    IconLayersDifference,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetric } from '../hooks/useMetricsCatalog';
import { MetricPeekDatePicker } from './MetricPeekDatePicker';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const MetricPeekModal: FC<Props> = ({ opened, onClose }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const { data, isLoading } = useMetric({
        projectUuid,
        tableName,
        metricName,
    });

    const history = useHistory();

    const handleClose = () => {
        history.push(`/projects/${projectUuid}/metrics`);
        onClose();
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            yOffset={150}
            scrollAreaComponent={undefined}
            size="auto"
            radius="md"
            title={
                <Group spacing="xs">
                    <Text fw={600} fz="lg" color="dark.7">
                        {data?.label}
                    </Text>
                    <Tooltip
                        label={data?.description}
                        disabled={!data?.description}
                    >
                        <MantineIcon
                            color="dark.3"
                            icon={IconInfoCircle}
                            size={18}
                        />
                    </Tooltip>
                </Group>
            }
            styles={(theme) => ({
                header: {
                    borderBottom: `1px solid ${theme.colors.gray[4]}`,
                    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                },
                body: {
                    padding: 0,
                    height: 800,
                },
            })}
        >
            <LoadingOverlay visible={isLoading} />

            <Group noWrap align="flex-start" h="100%">
                <Stack
                    spacing="xl"
                    p="xl"
                    bg="#FDFDFD"
                    sx={(theme) => ({
                        borderRight: `1px solid ${theme.colors.gray[2]}`,
                        flex: 1,
                    })}
                >
                    {data && (
                        <Stack w="100%" spacing="xs" align="flex-start">
                            <Text fw={500} c="gray.7">
                                Time filter
                            </Text>
                            <MetricPeekDatePicker
                                defaultTimeDimension={
                                    data?.defaultTimeDimension
                                }
                            />
                        </Stack>
                    )}
                    <Divider c="dark" />

                    <Stack w="100%" spacing="xs">
                        <Text fw={500} c="gray.7">
                            Comparison
                        </Text>

                        <Paper p="sm">
                            <Group position="apart" noWrap align="flex-start">
                                <Group noWrap align="flex-start">
                                    <Paper p="xs">
                                        <MantineIcon icon={IconCalendar} />
                                    </Paper>
                                    <Box>
                                        <Text fw={500} c="dark.8">
                                            Compare to previous year
                                        </Text>
                                        <Text c="gray.7">
                                            Show data from the same period last
                                            year
                                        </Text>
                                    </Box>
                                </Group>
                                <Checkbox />
                            </Group>
                        </Paper>
                        <Paper p="sm">
                            <Group position="apart" noWrap align="flex-start">
                                <Group noWrap align="flex-start">
                                    <Paper p="xs">
                                        <MantineIcon
                                            icon={IconLayersDifference}
                                        />
                                    </Paper>
                                    <Box>
                                        <Text fw={500} c="dark.8">
                                            Compare to another metric
                                        </Text>
                                        <Text c="gray.7">
                                            Compare {data?.label} with another
                                            metric
                                        </Text>
                                    </Box>
                                </Group>
                                <Checkbox />
                            </Group>
                        </Paper>
                    </Stack>
                </Stack>
                <Box w={900} h={400} p="xl">
                    <Center>
                        <MantineIcon
                            size={400}
                            strokeWidth={0.8}
                            color="gray.5"
                            icon={IconChartArcs3}
                        />
                    </Center>
                </Box>
            </Group>
        </Modal>
    );
};
