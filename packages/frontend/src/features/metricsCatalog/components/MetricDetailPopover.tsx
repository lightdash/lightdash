import {
    friendlyName,
    type MetricExplorerDateRange,
    type MetricTotalComparisonType,
    type MetricWithAssociatedTimeDimension,
    type TimeFrames,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    HoverCard,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconCode, IconTable } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExploreMetric } from '../hooks/useExploreMetric';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useCompileMetricTotalQuery } from '../hooks/useRunMetricExplorerQuery';
import classes from './MetricDetailPopover.module.css';

export type CompiledQueryConfig = {
    timeFrame: TimeFrames;
    granularity: TimeFrames;
    comparisonType: MetricTotalComparisonType;
    dateRange: MetricExplorerDateRange;
    rollingDays?: number;
};

type Props = {
    tableName: string;
    metricName: string;
    projectUuid: string;
    showExploreButton: boolean;
    children: ReactNode;
    compiledQueryConfig?: CompiledQueryConfig;
};

const CompiledQuerySection: FC<{
    projectUuid: string;
    exploreName: string;
    metricName: string;
    config: CompiledQueryConfig;
    isOpen: boolean;
}> = ({ projectUuid, exploreName, metricName, config, isOpen }) => {
    const [showSql, setShowSql] = useState(false);

    const { data, isLoading } = useCompileMetricTotalQuery({
        projectUuid,
        exploreName,
        metricName,
        timeFrame: config.timeFrame,
        granularity: config.granularity,
        comparisonType: config.comparisonType,
        dateRange: config.dateRange,
        rollingDays: config.rollingDays,
        options: {
            enabled: isOpen && showSql,
        },
    });

    return (
        <>
            <Divider />
            <Box>
                <Group gap="xs" mb={4} justify="space-between">
                    <Text size="xs" c="dimmed" fw={500}>
                        How's total calculated?
                    </Text>
                    <Group
                        gap={4}
                        className={classes.compiledToggle}
                        onClick={() => setShowSql((prev) => !prev)}
                    >
                        <MantineIcon
                            icon={IconCode}
                            size={12}
                            color={showSql ? 'indigo.6' : 'gray.6'}
                        />
                        <Text
                            size="xs"
                            c={showSql ? 'indigo.6' : 'dimmed'}
                            fw={500}
                        >
                            {showSql ? 'Hide SQL' : 'Show SQL'}
                        </Text>
                    </Group>
                </Group>
                {showSql &&
                    (isLoading ? (
                        <Group justify="center" py="md">
                            <Loader size="sm" />
                        </Group>
                    ) : data ? (
                        <Prism
                            language="sql"
                            className={classes.codeBlock}
                            copyLabel="Copy SQL"
                            copiedLabel="Copied!"
                        >
                            {data.query}
                        </Prism>
                    ) : (
                        <Text size="xs" c="dimmed">
                            Unable to load SQL
                        </Text>
                    ))}
            </Box>
        </>
    );
};

type MetricDetailContentProps = {
    metric: MetricWithAssociatedTimeDimension;
    tableName: string;
    metricName: string;
    showExploreButton: boolean;
    projectUuid: string;
    compiledQueryConfig?: CompiledQueryConfig;
    isOpen: boolean;
    onExplore: () => void;
};

const MetricDetailContent: FC<MetricDetailContentProps> = ({
    metric,
    tableName,
    metricName,
    showExploreButton,
    projectUuid,
    compiledQueryConfig,
    isOpen,
    onExplore,
}) => {
    const exploreMetric = useExploreMetric();
    const [showCompiled, setShowCompiled] = useState(false);
    const sqlToShow = showCompiled ? metric.compiledSql : metric.sql;

    return (
        <Stack gap="xs" w={compiledQueryConfig ? 400 : 300}>
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
                        {compiledQueryConfig ? 'Metric SQL' : 'SQL'}
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
                <Prism language="sql" className={classes.codeBlock} noCopy>
                    {sqlToShow}
                </Prism>
            </Box>

            {metric.timeDimension && (
                <>
                    <Divider />
                    <Group justify="space-between" gap="xs">
                        <Text size="xs" c="dimmed" fw={500} mb={4}>
                            Time dimension
                        </Text>
                        <Tooltip
                            label={`${metric.timeDimension.table}.${metric.timeDimension.field}`}
                            withinPortal
                        >
                            <Text size="xs">
                                {metric.timeDimension.table !== metric.table &&
                                    `${friendlyName(metric.timeDimension.table)} `}
                                {friendlyName(metric.timeDimension.field)} (
                                {friendlyName(metric.timeDimension.interval)})
                            </Text>
                        </Tooltip>
                    </Group>
                </>
            )}

            {compiledQueryConfig && (
                <CompiledQuerySection
                    projectUuid={projectUuid}
                    exploreName={metric.table}
                    metricName={metric.name}
                    config={compiledQueryConfig}
                    isOpen={isOpen}
                />
            )}

            {showExploreButton && (
                <Button
                    variant="dark"
                    size="xs"
                    fullWidth
                    onClick={() => {
                        // Close the hover card before opening the modal,
                        // otherwise its dropdown floats above the modal.
                        onExplore();
                        exploreMetric({ tableName, metricName });
                    }}
                >
                    Explore
                </Button>
            )}
        </Stack>
    );
};

export const MetricDetailPopover: FC<Props> = ({
    tableName,
    metricName,
    projectUuid,
    showExploreButton,
    children,
    compiledQueryConfig,
}) => {
    const [opened, setOpened] = useState(false);
    // HoverCard is uncontrolled (no `opened` prop), so bumping this key
    // remounts it to force the dropdown closed when the user explores.
    const [instanceKey, setInstanceKey] = useState(0);

    const { data: metric, isLoading } = useMetric({
        projectUuid,
        tableName,
        metricName,
        enabled: opened,
    });

    return (
        <HoverCard
            key={instanceKey}
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
                {metric && (
                    <MetricDetailContent
                        metric={metric}
                        tableName={tableName}
                        metricName={metricName}
                        showExploreButton={showExploreButton}
                        projectUuid={projectUuid}
                        compiledQueryConfig={compiledQueryConfig}
                        isOpen={opened}
                        onExplore={() => setInstanceKey((key) => key + 1)}
                    />
                )}
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
