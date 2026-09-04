import {
    addFilterRule,
    buildPopAdditionalMetric,
    FilterOperator,
    getFilterRules,
    getGranularityRank,
    getItemId,
    getPopPeriodLabel,
    hasPeriodOverPeriodAdditionalMetricWithConfig,
    isDimension,
    isSupportedPeriodOverPeriodGranularity,
    timeFrameConfigs,
    TimeFrames,
    UnitOfTime,
    type Dimension,
    type ItemsMap,
    type Metric,
    type PeriodOverPeriodComparisonMode,
} from '@lightdash/common';
import { Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconTimelineEvent } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectDimensions,
    selectFilters,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { NumberInput } from '../../common/NumberInput';

const TO_DATE_UNITS: Partial<Record<TimeFrames, UnitOfTime>> = {
    [TimeFrames.WEEK]: UnitOfTime.weeks,
    [TimeFrames.MONTH]: UnitOfTime.months,
    [TimeFrames.QUARTER]: UnitOfTime.quarters,
    [TimeFrames.YEAR]: UnitOfTime.years,
};

const PeriodOverPeriodComparisonModalContent: FC<{
    metric: Metric;
    itemsMap: ItemsMap;
}> = ({ metric, itemsMap }) => {
    const dispatch = useExplorerDispatch();
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const filters = useExplorerSelector(selectFilters);

    const selectedDimensions = useExplorerSelector(selectDimensions);

    const allTimeDimensions = useMemo(() => {
        if (!itemsMap || !selectedDimensions) return [];

        return selectedDimensions
            .map((dimId) => itemsMap[dimId])
            .filter(
                (item): item is Dimension =>
                    isDimension(item) &&
                    !!item.timeInterval &&
                    isSupportedPeriodOverPeriodGranularity(item.timeInterval),
            );
    }, [itemsMap, selectedDimensions]);

    // Find the finest granularity among all selected time dimensions
    const finestRank = useMemo(() => {
        if (allTimeDimensions.length === 0) return Infinity;
        return Math.min(
            ...allTimeDimensions.map((dim) =>
                getGranularityRank(dim.timeInterval as TimeFrames),
            ),
        );
    }, [allTimeDimensions]);

    const selectData = useMemo(
        () =>
            allTimeDimensions.map((dim) => {
                const rank = getGranularityRank(dim.timeInterval as TimeFrames);
                const isCoarser = rank > finestRank;

                return {
                    value: getItemId(dim),
                    label: dim.label || dim.name,
                    disabled: isCoarser,
                };
            }),
        [allTimeDimensions, finestRank],
    );

    const renderSelectOption: React.ComponentProps<
        typeof Select
    >['renderOption'] = ({ option }) => {
        if (option.disabled) {
            return (
                <Tooltip
                    label="Your results are grouped by a finer time period"
                    position="right"
                >
                    <Text size="sm" c="dimmed">
                        {option.label}
                    </Text>
                </Tooltip>
            );
        }
        return <Text size="sm">{option.label}</Text>;
    };

    const [selectedTimeDimensionId, setSelectedTimeDimensionId] = useState<
        string | null
    >(null);
    const [periodOffset, setPeriodOffset] = useState<number>(1);
    const [comparisonMode, setComparisonMode] =
        useState<PeriodOverPeriodComparisonMode>('full');

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

    const canConfigure = allTimeDimensions.length > 0;

    const selectedGranularity = useMemo(() => {
        const interval = selectedDimensionObj?.timeInterval;
        if (!interval) return null;
        if (!isSupportedPeriodOverPeriodGranularity(interval)) return null;
        return interval as TimeFrames;
    }, [selectedDimensionObj?.timeInterval]);

    const effectivePeriodOffset = useMemo(
        () => (periodOffset >= 1 ? periodOffset : 1),
        [periodOffset],
    );

    const toDateUnit = selectedGranularity
        ? TO_DATE_UNITS[selectedGranularity]
        : undefined;

    const timeDimensionId = useMemo(() => {
        if (!selectedDimensionObj) return null;
        return getItemId(selectedDimensionObj);
    }, [selectedDimensionObj]);

    const toDateFilterAlreadyExists = useMemo(
        () =>
            !!timeDimensionId &&
            !!toDateUnit &&
            getFilterRules(filters).some(
                (filter) =>
                    filter.target.fieldId === timeDimensionId &&
                    filter.operator === FilterOperator.IN_PERIOD_TO_DATE &&
                    filter.settings?.unitOfTime === toDateUnit &&
                    filter.disabled !== true,
            ),
        [filters, timeDimensionId, toDateUnit],
    );

    const effectiveComparisonMode = toDateFilterAlreadyExists
        ? 'toDate'
        : comparisonMode;
    const comparisonModeOptions = useMemo(
        () => [
            {
                value: 'full',
                label: 'Full periods',
                disabled: toDateFilterAlreadyExists,
            },
            {
                value: 'toDate',
                label: selectedGranularityLabel
                    ? `All ${selectedGranularityLabel.toLowerCase()}s to date`
                    : 'All periods to date',
                disabled: !toDateUnit,
            },
        ],
        [selectedGranularityLabel, toDateFilterAlreadyExists, toDateUnit],
    );

    const popAlreadyExists = useMemo(() => {
        if (!timeDimensionId || !selectedGranularity) return false;
        const baseMetricId = getItemId(metric);
        return hasPeriodOverPeriodAdditionalMetricWithConfig({
            additionalMetrics,
            baseMetricId,
            timeDimensionId,
            granularity: selectedGranularity,
            periodOffset: effectivePeriodOffset,
        });
    }, [
        additionalMetrics,
        effectivePeriodOffset,
        metric,
        selectedGranularity,
        timeDimensionId,
    ]);

    const closeModal = useCallback(() => {
        dispatch(
            explorerActions.togglePeriodOverPeriodComparisonModal(undefined),
        );
    }, [dispatch]);

    const handleAddComparison = useCallback(() => {
        if (!selectedDimensionObj || !timeDimensionId || !selectedGranularity)
            return;
        if (popAlreadyExists) return;

        const { additionalMetric } = buildPopAdditionalMetric({
            metric,
            timeDimensionId,
            granularity: selectedGranularity,
            periodOffset: effectivePeriodOffset,
            comparisonMode: effectiveComparisonMode,
        });
        dispatch(explorerActions.addAdditionalMetric(additionalMetric));

        if (
            effectiveComparisonMode === 'toDate' &&
            toDateUnit &&
            !toDateFilterAlreadyExists
        ) {
            dispatch(
                explorerActions.setFilters(
                    addFilterRule({
                        filters,
                        field: selectedDimensionObj,
                        operator: FilterOperator.IN_PERIOD_TO_DATE,
                        settings: {
                            unitOfTime: toDateUnit,
                            completed: false,
                        },
                    }),
                ),
            );
        }

        dispatch(explorerActions.requestQueryExecution());
        dispatch(
            explorerActions.togglePeriodOverPeriodComparisonModal(undefined),
        );
    }, [
        dispatch,
        effectiveComparisonMode,
        effectivePeriodOffset,
        filters,
        metric,
        popAlreadyExists,
        selectedDimensionObj,
        selectedGranularity,
        timeDimensionId,
        toDateFilterAlreadyExists,
        toDateUnit,
    ]);

    return (
        <MantineModal
            opened
            onClose={closeModal}
            title="Add period comparison"
            confirmLabel="Add comparison"
            onConfirm={handleAddComparison}
            confirmDisabled={
                !selectedDimensionObj ||
                !timeDimensionId ||
                !selectedGranularity ||
                popAlreadyExists
            }
            icon={IconTimelineEvent}
        >
            <Stack>
                {selectedGranularity && timeDimensionId && popAlreadyExists ? (
                    <Callout
                        variant="warning"
                        title="This comparison already exists"
                    >
                        A period comparison with the same time dimension and
                        offset already exists for this metric. Choose a
                        different time dimension or offset.
                    </Callout>
                ) : null}
                <Select
                    label="Time dimension"
                    placeholder={
                        canConfigure
                            ? 'Select time dimension'
                            : 'Add a time dimension to enable comparison'
                    }
                    data={selectData}
                    value={selectedTimeDimensionId}
                    onChange={(value) => {
                        setSelectedTimeDimensionId(value);
                        const item = value ? itemsMap[value] : undefined;
                        const interval = isDimension(item)
                            ? item.timeInterval
                            : undefined;
                        if (!interval || !TO_DATE_UNITS[interval]) {
                            setComparisonMode('full');
                        }
                    }}
                    disabled={!canConfigure}
                    renderOption={renderSelectOption}
                    searchable
                    clearable
                />

                <Group gap="xs" align="center">
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
                    <Text size="sm" c="dimmed" mt="lg">
                        {selectedGranularityLabel
                            ? `${selectedGranularityLabel} granularity`
                            : 'Granularity derived from dimension'}
                    </Text>
                </Group>

                <Select
                    label="Comparison mode"
                    data={comparisonModeOptions}
                    value={effectiveComparisonMode}
                    onChange={(value) => {
                        if (value) {
                            setComparisonMode(
                                value as PeriodOverPeriodComparisonMode,
                            );
                        }
                    }}
                    allowDeselect={false}
                />

                {selectedGranularity && timeDimensionId ? (
                    <Text size="sm" c="dimmed">
                        This will create:{' '}
                        <Text span fw={600}>
                            {metric.label}{' '}
                            {`(${getPopPeriodLabel(
                                selectedGranularity,
                                effectivePeriodOffset,
                                effectiveComparisonMode,
                            )})`}
                        </Text>
                    </Text>
                ) : null}
            </Stack>
        </MantineModal>
    );
};

export const PeriodOverPeriodComparisonModal: FC = () => {
    const { isOpen, metric, itemsMap } = useExplorerSelector(
        (state) => state.explorer.modals.periodOverPeriodComparison,
    );

    if (!isOpen || !metric || !itemsMap) return null;

    return (
        <PeriodOverPeriodComparisonModalContent
            metric={metric}
            itemsMap={itemsMap}
        />
    );
};
