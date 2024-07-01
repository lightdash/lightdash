import {
    ActionIcon,
    Button,
    Group,
    Paper,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustmentsCog,
    IconLayoutNavbarCollapse,
    IconLayoutNavbarExpand,
    IconPlayerPlay,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    isChartConfigOpen: boolean;
    openChartConfig: () => void;
    closeChartConfig: () => void;
};

export const ContentPanel: FC<Props> = ({
    isChartConfigOpen,
    openChartConfig,
    closeChartConfig,
}) => {
    const [opened, { toggle }] = useDisclosure(true);
    return (
        <Stack h="100vh" spacing="none" style={{ flex: 1 }}>
            <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                <Group position="apart">
                    <Title order={5} c="gray.6">
                        SQL panel
                    </Title>
                    <Group spacing="md">
                        <Tooltip
                            variant="xs"
                            label={opened ? 'Collapse' : 'Expand'}
                            position="bottom"
                        >
                            <ActionIcon size="xs" onClick={toggle}>
                                <MantineIcon
                                    icon={
                                        opened
                                            ? IconLayoutNavbarCollapse
                                            : IconLayoutNavbarExpand
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            variant="xs"
                            label="Run query"
                            position="bottom"
                        >
                            <Button
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                            >
                                Run query
                            </Button>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
            <Paper
                shadow="none"
                radius={0}
                px="md"
                py="sm"
                withBorder
                style={{ flex: 1 }}
            >
                todo: sql editor
            </Paper>
            <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                <Group position="apart">
                    <Title order={5} c="gray.6">
                        Results/Chart panel
                    </Title>
                    <Group spacing="md">
                        <Tooltip
                            variant="xs"
                            label={opened ? 'Collapse' : 'Expand'}
                            position="bottom"
                        >
                            <ActionIcon size="xs" onClick={toggle}>
                                <MantineIcon
                                    icon={
                                        opened
                                            ? IconLayoutNavbarExpand
                                            : IconLayoutNavbarCollapse
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            variant="xs"
                            label="Run query"
                            position="bottom"
                        >
                            <ActionIcon
                                size="xs"
                                onClick={
                                    isChartConfigOpen
                                        ? closeChartConfig
                                        : openChartConfig
                                }
                            >
                                <MantineIcon icon={IconAdjustmentsCog} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
            <Paper
                shadow="none"
                radius={0}
                px="md"
                py="sm"
                withBorder
                style={{ flex: 1 }}
            >
                todo: results
            </Paper>
        </Stack>
    );
};
