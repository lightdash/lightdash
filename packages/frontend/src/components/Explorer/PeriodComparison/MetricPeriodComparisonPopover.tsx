import {
    getItemId,
    isDimension,
    isSupportedPeriodOverPeriodGranularity,
    timeFrameConfigs,
    TimeFrames,
    type AdditionalMetric,
    type Dimension,
    type ItemsMap,
    type Metric,
    type PeriodOverPeriodComparison,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    NumberInput,
    Popover,
    Select,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconTimelineEvent, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectDimensions,
    selectPeriodOverPeriod,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    metric: Metric;
    itemsMap: ItemsMap | undefined;
    /**
     * Optional callbacks to keep chart layout in sync (e.g. cartesian yFields).
     * If omitted, this component only updates explorer state.
     */
    onAddFieldIdToLayout?: (fieldId: string) => void;
    onRemoveFieldIdFromLayout?: (fieldId: string) => void;
};

const getPopMetricId = (baseMetricId: string) => `${baseMetricId}_previous`;

const buildPeriodOverPeriod = (
    dimension: Dimension,
    periodOffset: number,
): PeriodOverPeriodComparison | null => {
    if (!dimension.timeInterval) return null;
    if (!isSupportedPeriodOverPeriodGranularity(dimension.timeInterval))
        return null;

    return {
        type: 'previousPeriod',
        granularity: dimension.timeInterval as TimeFrames,
        periodOffset,
        field: { table: dimension.table, name: dimension.name },
    };
};

// Granularity order from finest to coarsest (lower index = finer)
const GRANULARITY_ORDER: TimeFrames[] = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

const getGranularityRank = (granularity: TimeFrames): number => {
    const index = GRANULARITY_ORDER.indexOf(granularity);
    return index === -1 ? Infinity : index;
};

export const MetricPeriodComparisonPopover: FC<Props> = ({
    metric,
    itemsMap,
    onAddFieldIdToLayout,
    onRemoveFieldIdFromLayout,
}) => {
    const dispatch = useExplorerDispatch();
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const periodOverPeriod = useExplorerSelector(selectPeriodOverPeriod);

    const [opened, setOpened] = useState(false);
    const selectedDimensions = useExplorerSelector(selectDimensions);

    const availableTimeDimensions = useMemo(() => {
        if (!itemsMap || !selectedDimensions) return [];

        const allTimeDimensions = selectedDimensions
            .map((dimId) => itemsMap[dimId])
            .filter(
                (item): item is Dimension =>
                    isDimension(item) &&
                    !!item.timeInterval &&
                    isSupportedPeriodOverPeriodGranularity(item.timeInterval),
            );

        if (allTimeDimensions.length <= 1) return allTimeDimensions;

        // Find the finest granularity among all selected time dimensions
        const finestRank = Math.min(
            ...allTimeDimensions.map((dim) =>
                getGranularityRank(dim.timeInterval as TimeFrames),
            ),
        );

        // Only include dimensions that match the finest granularity
        // (exclude coarser ones like Year when Month is also selected)
        return allTimeDimensions.filter(
            (dim) =>
                getGranularityRank(dim.timeInterval as TimeFrames) ===
                finestRank,
        );
    }, [itemsMap, selectedDimensions]);

    const selectData = useMemo(
        () =>
            availableTimeDimensions.map((dim) => ({
                value: getItemId(dim),
                label: dim.label || dim.name,
            })),
        [availableTimeDimensions],
    );

    const [selectedTimeDimensionId, setSelectedTimeDimensionId] = useState<
        string | null
    >(null);
    const [periodOffset, setPeriodOffset] = useState<number>(
        periodOverPeriod?.periodOffset ?? 1,
    );

    const selectedDimensionObj = useMemo(() => {
        if (!selectedTimeDimensionId || !itemsMap) return null;
        const dim = itemsMap[selectedTimeDimensionId];
        return isDimension(dim) ? dim : null;
    }, [selectedTimeDimensionId, itemsMap]);

    const selectedGranularityLabel = useMemo(() => {
        if (!selectedDimensionObj?.timeInterval) return null;
        return (
            timeFrameConfigs[selectedDimensionObj.timeInterval]?.getLabel() ||
            null
        );
    }, [selectedDimensionObj]);

    const baseMetricId = getItemId(metric);
    const popMetricId = getPopMetricId(baseMetricId);

    const popAdditionalMetric = useMemo(
        () =>
            additionalMetrics.find(
                (am) => getItemId(am as AdditionalMetric) === popMetricId,
            ),
        [additionalMetrics, popMetricId],
    );

    const popIsSelected = !!popAdditionalMetric;

    const canConfigure = availableTimeDimensions.length > 0;

    const effectivePeriodOverPeriod = useMemo(() => {
        if (periodOverPeriod) return periodOverPeriod;
        if (!selectedDimensionObj) return null;
        return buildPeriodOverPeriod(selectedDimensionObj, periodOffset);
    }, [periodOverPeriod, selectedDimensionObj, periodOffset]);

    const periodLabel = useMemo(() => {
        if (!effectivePeriodOverPeriod) return null;
        const offset = effectivePeriodOverPeriod.periodOffset ?? 1;
        const label =
            timeFrameConfigs[
                effectivePeriodOverPeriod.granularity
            ]?.getLabel() || effectivePeriodOverPeriod.granularity;

        return offset === 1
            ? `Previous ${String(label).toLowerCase()}`
            : `${offset} ${String(label).toLowerCase()}s ago`;
    }, [effectivePeriodOverPeriod]);

    const handleOpenChange = useCallback(
        (isOpen: boolean) => {
            setOpened(isOpen);
            if (!isOpen) return;

            if (periodOverPeriod?.field) {
                setSelectedTimeDimensionId(
                    `${periodOverPeriod.field.table}.${periodOverPeriod.field.name}`,
                );
                setPeriodOffset(periodOverPeriod.periodOffset ?? 1);
                return;
            }

            if (availableTimeDimensions.length > 0) {
                setSelectedTimeDimensionId(
                    getItemId(availableTimeDimensions[0]),
                );
                setPeriodOffset(1);
            } else {
                setSelectedTimeDimensionId(null);
                setPeriodOffset(1);
            }
        },
        [periodOverPeriod, availableTimeDimensions],
    );

    const applyConfiguration = useCallback(() => {
        if (!selectedDimensionObj) return;
        const next = buildPeriodOverPeriod(selectedDimensionObj, periodOffset);
        if (!next) return;

        dispatch(explorerActions.setPeriodOverPeriod(next));
        dispatch(explorerActions.requestQueryExecution());

        handleTogglePopMetric(true);
    }, [dispatch, selectedDimensionObj, periodOffset]);

    const clearConfiguration = useCallback(() => {
        dispatch(explorerActions.setPeriodOverPeriod(undefined));
        dispatch(explorerActions.requestQueryExecution());
    }, [dispatch]);

    const handleTogglePopMetric = useCallback(
        (enabled: boolean) => {
            if (!effectivePeriodOverPeriod || !periodLabel) return;

            if (!periodOverPeriod) {
                dispatch(
                    explorerActions.setPeriodOverPeriod(
                        effectivePeriodOverPeriod,
                    ),
                );
            }

            if (enabled) {
                if (!popAdditionalMetric) {
                    dispatch(
                        explorerActions.addAdditionalMetric({
                            uuid: null,
                            table: metric.table,
                            name: `${metric.name}_previous`,
                            label: `${metric.label} (${periodLabel})`,
                            description: metric.description,
                            type: metric.type,
                            sql: metric.sql,
                            hidden: true,
                            round: metric.round,
                            compact: metric.compact,
                            format: metric.format,
                            generatedBy: 'periodOverPeriod',
                            baseMetricId: baseMetricId,
                        }),
                    );
                }
                onAddFieldIdToLayout?.(popMetricId);
            } else {
                onRemoveFieldIdFromLayout?.(popMetricId);
                if (popAdditionalMetric) {
                    dispatch(
                        explorerActions.removeAdditionalMetric(popMetricId),
                    );
                }
            }

            dispatch(explorerActions.requestQueryExecution());
        },
        [
            dispatch,
            effectivePeriodOverPeriod,
            periodLabel,
            periodOverPeriod,
            popAdditionalMetric,
            metric,
            baseMetricId,
            popMetricId,
            onAddFieldIdToLayout,
            onRemoveFieldIdFromLayout,
        ],
    );

    const disabledReason = useMemo(() => {
        if (!canConfigure) return 'Add a time dimension to enable comparison';
        return null;
    }, [canConfigure]);

    return (
        <Popover
            opened={opened}
            onChange={handleOpenChange}
            position="bottom-end"
            withArrow
            withinPortal
            shadow="md"
        >
            <Popover.Target>
                <Tooltip
                    label={disabledReason || 'Period comparison'}
                    variant="xs"
                    withinPortal
                >
                    <ActionIcon
                        variant={popIsSelected ? 'light' : 'subtle'}
                        color={popIsSelected ? 'blue' : 'gray'}
                        disabled={!canConfigure}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            setOpened((prev) => !prev);
                        }}
                    >
                        <MantineIcon icon={IconTimelineEvent} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown>
                <Stack spacing="md" w={320}>
                    <Group position="apart" noWrap>
                        <Text fw={600} size="sm">
                            Period comparison
                        </Text>
                        <ActionIcon
                            variant="subtle"
                            onClick={() => setOpened(false)}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Group>

                    <Stack spacing="xs">
                        <Select
                            label="Time dimension"
                            placeholder="Select time dimension"
                            data={selectData}
                            value={selectedTimeDimensionId}
                            onChange={setSelectedTimeDimensionId}
                            disabled={!canConfigure}
                            searchable
                            clearable
                        />
                        <Group spacing="xs" noWrap>
                            <NumberInput
                                label="Offset"
                                min={1}
                                value={periodOffset}
                                onChange={(value) =>
                                    setPeriodOffset(
                                        typeof value === 'number' ? value : 1,
                                    )
                                }
                                w={120}
                            />
                            <Text size="sm" color="dimmed" mt={24}>
                                {selectedGranularityLabel
                                    ? `${selectedGranularityLabel} granularity`
                                    : 'Granularity derived from dimension'}
                            </Text>
                        </Group>

                        <Group spacing="xs">
                            <Button
                                size="xs"
                                variant="light"
                                onClick={applyConfiguration}
                                disabled={!selectedDimensionObj}
                            >
                                Apply
                            </Button>
                            <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={clearConfiguration}
                                disabled={!periodOverPeriod}
                            >
                                Disable
                            </Button>
                        </Group>
                    </Stack>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
