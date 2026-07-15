import {
    applyCustomFormat,
    ComparisonFormatTypes,
    CustomFormatType,
    formatItemValue,
    getDefaultDateRangeFromInterval,
    MetricTotalComparisonType,
    TimeFrames,
    type HomepageMetricRef,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Card,
    Group,
    Loader,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChartDots, IconHash, IconPlus, IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { useMetricsCatalog } from '../../../../features/metricsCatalog/hooks/useMetricsCatalog';
import { useRunMetricTotal } from '../../../../features/metricsCatalog/hooks/useRunMetricExplorerQuery';
import { calculateComparisonValue } from '../../../../hooks/useBigNumberConfig';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const KPI_TIME_FRAME = TimeFrames.MONTH;

const MetricKpiCard: FC<{
    metricRef: HomepageMetricRef;
    projectUuid: string;
}> = ({ metricRef, projectUuid }) => {
    const dateRange = useMemo(
        () => getDefaultDateRangeFromInterval(KPI_TIME_FRAME),
        [],
    );
    const totalQuery = useRunMetricTotal({
        projectUuid,
        exploreName: metricRef.tableName,
        metricName: metricRef.metricName,
        timeFrame: KPI_TIME_FRAME,
        granularity: KPI_TIME_FRAME,
        comparisonType: MetricTotalComparisonType.PREVIOUS_PERIOD,
        dateRange,
        options: { retry: false },
    });

    const change = useMemo(() => {
        const value = totalQuery.data?.value;
        const compareValue = totalQuery.data?.comparisonValue;
        if (value && compareValue) {
            return calculateComparisonValue(
                Number(value),
                Number(compareValue),
                ComparisonFormatTypes.PERCENTAGE,
            );
        }
        return undefined;
    }, [totalQuery.data]);

    if (totalQuery.isInitialLoading) {
        return <Skeleton h={92} radius="md" />;
    }

    return (
        <Anchor
            component={Link}
            to={`/projects/${projectUuid}/metrics/peek/${metricRef.tableName}/${metricRef.metricName}`}
            underline="never"
            c="inherit"
        >
            <Box
                className={`${classes.hoverCard} ${classes.clickable}`}
                p={14}
                h="100%"
            >
                <div className={classes.kpiLabel}>
                    {totalQuery.data?.metric.label ?? metricRef.label}
                </div>
                {totalQuery.isError ? (
                    <Text size="sm" c="dimmed">
                        Couldn’t load this metric
                    </Text>
                ) : (
                    <>
                        <div className={classes.kpiValue}>
                            {totalQuery.data
                                ? formatItemValue(
                                      totalQuery.data.metric,
                                      totalQuery.data.value,
                                  )
                                : '-'}
                        </div>
                        <Group gap={6}>
                            {change !== undefined && (
                                <span
                                    className={`${classes.kpiDelta} ${
                                        change >= 0
                                            ? classes.kpiDeltaUp
                                            : classes.kpiDeltaDown
                                    }`}
                                >
                                    {change >= 0 ? '↑' : '↓'}{' '}
                                    {applyCustomFormat(change, {
                                        round: 2,
                                        type: CustomFormatType.PERCENT,
                                    })}
                                </span>
                            )}
                            <Text size="xs" c="dimmed">
                                vs previous period
                            </Text>
                        </Group>
                    </>
                )}
            </Box>
        </Anchor>
    );
};

const MetricsPickerModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    selected: HomepageMetricRef[];
    onAdd: (metricRef: HomepageMetricRef) => void;
}> = ({ opened, onClose, projectUuid, selected, onAdd }) => {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const { data, isFetching } = useMetricsCatalog({
        projectUuid: opened ? projectUuid : undefined,
        search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
        pageSize: 25,
    });
    const results = (data?.pages ?? [])
        .flatMap((page) => page.data)
        .filter(
            (metric) =>
                !selected.some(
                    (ref) =>
                        ref.tableName === metric.tableName &&
                        ref.metricName === metric.name,
                ),
        );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Choose metrics"
            size="lg"
        >
            <Stack gap="sm">
                <TextInput
                    placeholder="Search metrics…"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    rightSection={isFetching ? <Loader size="xs" /> : null}
                />
                <Stack gap={4} mah={360} className={classes.pickerScrollList}>
                    {results.map((metric) => (
                        <Group
                            key={metric.catalogSearchUuid}
                            gap="sm"
                            wrap="nowrap"
                            p="xs"
                            className={classes.pickerRow}
                            onClick={() =>
                                onAdd({
                                    tableName: metric.tableName,
                                    metricName: metric.name,
                                    label: metric.label ?? metric.name,
                                })
                            }
                        >
                            <MantineIcon icon={IconHash} color="gray" />
                            <Box flex={1} miw={0}>
                                <Text size="sm" fw={500} truncate>
                                    {metric.label ?? metric.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {metric.tableLabel ?? metric.tableName}
                                </Text>
                            </Box>
                            <MantineIcon icon={IconPlus} color="gray" />
                        </Group>
                    ))}
                    {results.length === 0 && !isFetching && (
                        <Text size="sm" c="dimmed" p="sm">
                            No matching metrics.
                        </Text>
                    )}
                </Stack>
            </Stack>
        </MantineModal>
    );
};

export const MetricsBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'metrics' || block.config.items.length === 0) {
        return null;
    }
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconChartDots}
                iconColor="light-dark(#de7f0b, #e08a20)"
                title={block.config.title}
            />
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing={12}>
                {block.config.items.map((metricRef) => (
                    <MetricKpiCard
                        key={`${metricRef.tableName}-${metricRef.metricName}`}
                        metricRef={metricRef}
                        projectUuid={projectUuid}
                    />
                ))}
            </SimpleGrid>
        </Stack>
    );
};

export const MetricsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    if (block.type !== 'metrics') return null;

    return (
        <Stack gap="xs">
            <TextInput
                aria-label="Metrics title"
                size="xs"
                fw={600}
                value={block.config.title}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            title: e.currentTarget.value,
                        },
                    })
                }
            />
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
                {block.config.items.map((metricRef) => (
                    <Card
                        key={`${metricRef.tableName}-${metricRef.metricName}`}
                        withBorder
                        p="sm"
                    >
                        <Group gap="xs" wrap="nowrap" justify="space-between">
                            <Box miw={0}>
                                <Text size="sm" fw={500} truncate>
                                    {metricRef.label}
                                </Text>
                                <Text size="xs" c="dimmed" truncate>
                                    {metricRef.tableName}
                                </Text>
                            </Box>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label={`Remove metric ${metricRef.label}`}
                                onClick={() =>
                                    onChange({
                                        ...block,
                                        config: {
                                            ...block.config,
                                            items: block.config.items.filter(
                                                (item) =>
                                                    item.metricName !==
                                                        metricRef.metricName ||
                                                    item.tableName !==
                                                        metricRef.tableName,
                                            ),
                                        },
                                    })
                                }
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Group>
                    </Card>
                ))}
            </SimpleGrid>
            <Button
                variant="default"
                size="xs"
                w="fit-content"
                leftSection={<MantineIcon icon={IconHash} />}
                onClick={() => setIsPickerOpen(true)}
            >
                Choose metrics from catalog…
            </Button>
            <MetricsPickerModal
                opened={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                projectUuid={projectUuid}
                selected={block.config.items}
                onAdd={(metricRef) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            items: [...block.config.items, metricRef],
                        },
                    })
                }
            />
        </Stack>
    );
};
