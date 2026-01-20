import { type MetricWithAssociatedTimeDimension } from '@lightdash/common';
import {
    Badge,
    Box,
    Code,
    Divider,
    Group,
    HoverCard,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconCode, IconTable } from '@tabler/icons-react';
import { type FC, type ReactNode, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useMetric } from '../hooks/useMetricsCatalog';
import classes from './MetricDetailPopover.module.css';

type Props = {
    tableName: string;
    metricName: string;
    projectUuid: string;
    children: ReactNode;
};

const MetricDetailContent: FC<{
    metric: MetricWithAssociatedTimeDimension;
}> = ({ metric }) => {
    const [showCompiled, setShowCompiled] = useState(false);
    const sqlToShow = showCompiled ? metric.compiledSql : metric.sql;

    return (
        <Stack gap="xs" w="300px">
            <Group gap="xs" wrap="nowrap" justify="space-between">
                <Group gap="xs" wrap="nowrap">
                    <MantineIcon icon={IconTable} color="gray.6" size={14} />
                    <Text size="sm" fw={500} className={classes.tableName}>
                        {metric.tableLabel}
                    </Text>
                </Group>
                <Badge size="xs" variant="light" color="indigo" radius="sm">
                    {metric.type.toUpperCase()}
                </Badge>
            </Group>

            <Divider />

            <Box>
                <Group gap="xs" mb={4} justify="space-between">
                    <Text size="xs" c="dimmed" fw={500}>
                        SQL
                    </Text>
                    <Tooltip label="Show compiled SQL" withinPortal>
                        <Group
                            gap={4}
                            className={classes.compiledToggle}
                            onClick={() => setShowCompiled((prev) => !prev)}
                        >
                            <MantineIcon
                                icon={IconCode}
                                size={12}
                                color={showCompiled ? 'indigo.6' : 'gray.6'}
                            />
                            <Text
                                size="xs"
                                c={showCompiled ? 'indigo.6' : 'dimmed'}
                                fw={500}
                            >
                                Compiled SQL
                            </Text>
                        </Group>
                    </Tooltip>
                </Group>
                <Code block className={classes.codeBlock}>
                    {sqlToShow}
                </Code>
            </Box>
        </Stack>
    );
};

export const MetricDetailPopover: FC<Props> = ({
    tableName,
    metricName,
    projectUuid,
    children,
}) => {
    const [opened, setOpened] = useState(false);

    const { data: metric, isLoading } = useMetric({
        projectUuid,
        tableName,
        metricName,
        enabled: opened,
    });

    return (
        <HoverCard
            position="bottom-start"
            withArrow
            shadow="md"
            radius="md"
            offset={8}
            openDelay={300}
            closeDelay={200}
            onOpen={() => setOpened(true)}
            onClose={() => setOpened(false)}
        >
            <HoverCard.Target>
                <Box className={classes.target}>{children}</Box>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                {isLoading && (
                    <Group justify="center" p="md">
                        <Loader size="sm" />
                    </Group>
                )}
                {metric && <MetricDetailContent metric={metric} />}
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
