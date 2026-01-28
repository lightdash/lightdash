import {
    buildPopAdditionalMetric,
    buildPopAdditionalMetricName,
    getGranularityRank,
    getItemId,
    getPopPeriodLabel,
    isDimension,
    isSupportedPeriodOverPeriodGranularity,
    timeFrameConfigs,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TimeFrames,
} from '@lightdash/common';
import {
    Group,
    NumberInput,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconTimelineEvent } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectDimensions,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import MantineModal from '../../common/MantineModal';

const PeriodOverPeriodComparisonModalContent: FC<{
    metric: Metric;
    itemsMap: ItemsMap;
}> = ({ metric, itemsMap }) => {
    const dispatch = useExplorerDispatch();
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);

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
                    withinPortal
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

    const timeDimensionId = useMemo(() => {
        if (!selectedDimensionObj) return null;
        return getItemId(selectedDimensionObj);
    }, [selectedDimensionObj]);

    const popMetricIdForSelection = useMemo(() => {
        if (!timeDimensionId || !selectedGranularity) return null;
        const name = buildPopAdditionalMetricName(metric.name);
        return `${metric.table}.${name}`;
    }, [metric.name, metric.table, selectedGranularity, timeDimensionId]);

    const popAlreadyExists = useMemo(() => {
        if (!popMetricIdForSelection) return false;
        return additionalMetrics.some(
            (am) => getItemId(am) === popMetricIdForSelection,
        );
    }, [additionalMetrics, popMetricIdForSelection]);

    const closeModal = useCallback(() => {
        dispatch(
            explorerActions.togglePeriodOverPeriodComparisonModal(undefined),
        );
    }, [dispatch]);

    const handleAddComparison = useCallback(() => {
        if (!selectedDimensionObj || !timeDimensionId || !selectedGranularity)
            return;
        if (!popMetricIdForSelection) return;

        if (!popAlreadyExists) {
            const { additionalMetric } = buildPopAdditionalMetric({
                metric,
                timeDimensionId,
                granularity: selectedGranularity,
                periodOffset: effectivePeriodOffset,
            });
            dispatch(explorerActions.addAdditionalMetric(additionalMetric));
        }

        dispatch(explorerActions.requestQueryExecution());
        dispatch(
            explorerActions.togglePeriodOverPeriodComparisonModal(undefined),
        );
    }, [
        dispatch,
        effectivePeriodOffset,
        popAlreadyExists,
        popMetricIdForSelection,
        selectedDimensionObj,
        selectedGranularity,
        timeDimensionId,
        metric,
    ]);

    return (
        <MantineModal
            opened
            onClose={closeModal}
            title="Add period comparison"
            confirmLabel="Add comparison"
            onConfirm={handleAddComparison}
            icon={IconTimelineEvent}
        >
            <Stack>
                <Select
                    label="Time dimension"
                    placeholder={
                        canConfigure
                            ? 'Select time dimension'
                            : 'Add a time dimension to enable comparison'
                    }
                    data={selectData}
                    value={selectedTimeDimensionId}
                    onChange={setSelectedTimeDimensionId}
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

                {selectedGranularity && timeDimensionId ? (
                    <Text size="sm" c="dimmed">
                        This will create:{' '}
                        <Text span fw={600}>
                            {metric.label}{' '}
                            {`(${getPopPeriodLabel(
                                selectedGranularity,
                                effectivePeriodOffset,
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
