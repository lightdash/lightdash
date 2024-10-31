import { Group, Modal, Stack, Text, type ModalProps } from '@mantine/core';
import { IconDeviceAnalytics } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = ModalProps;

export const MetricChartsUsageModal: FC<Props> = ({ opened, onClose }) => {
    // const activeMetric = useAppSelector(
    //     (state) => state.metricsCatalog.activeMetric,
    // );
    // const projectUuid = useAppSelector(
    //     (state) => state.metricsCatalog.projectUuid,
    // );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconDeviceAnalytics}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>Metric Usage</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md" spacing="xs">
                <Text>This metric is used in the following charts:</Text>
                {/* TODO: Add charts usage endpoint query data here */}
                {/* <List pl="sm">
                    {activeMetric?.analytics?.charts.map((chart) => (
                        <List.Item key={chart.uuid} fz="sm">
                            <Anchor
                                href={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                target="_blank"
                            >
                                {chart.name}
                            </Anchor>
                        </List.Item>
                    ))}
                </List> */}
            </Stack>
        </Modal>
    );
};
