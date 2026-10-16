import {
    buildPopAdditionalMetric,
    getGranularityRank,
    getItemId,
    getPopPeriodLabel,
    hasPeriodOverPeriodAdditionalMetricWithConfig,
    isDimension,
    isSupportedPeriodOverPeriodGranularity,
    timeFrameConfigs,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TimeFrames,
} from '@lightdash/common';
import { Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconTimelineEvent } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectDimensions,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { NumberInput } from '../../common/NumberInput';

const PeriodOverPeriodComparisonModalContent: FC<{
    metric: Metric;
    itemsMap: ItemsMap;
}> = ({ metric, itemsMap }) => {
    const { t } = useTranslation('explorer');
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
                    label={t('periodComparison.finerPeriod')}
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

    const [chosenTimeDimensionId, setSelectedTimeDimensionId] = useState<
        string | null
    >(null);
    const eligibleTimeDimensions = selectData.filter(
        (option) => !option.disabled,
    );
    const singleTimeDimension =
        eligibleTimeDimensions.length === 1 ? eligibleTimeDimensions[0] : null;
    const selectedTimeDimensionId =
        singleTimeDimension?.value ?? chosenTimeDimensionId;
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
        });
        dispatch(explorerActions.addAdditionalMetric(additionalMetric));

        dispatch(explorerActions.requestQueryExecution());
        dispatch(
            explorerActions.togglePeriodOverPeriodComparisonModal(undefined),
        );
    }, [
        dispatch,
        effectivePeriodOffset,
        popAlreadyExists,
        selectedDimensionObj,
        selectedGranularity,
        timeDimensionId,
        metric,
    ]);

    return (
        <MantineModal
            opened
            onClose={closeModal}
            title={t('periodComparison.title')}
            confirmLabel={t('periodComparison.confirm')}
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
                        title={t('periodComparison.exists.title')}
                    >
                        {t('periodComparison.exists.description')}
                    </Callout>
                ) : null}
                {singleTimeDimension ? (
                    <Stack gap={4}>
                        <Text size="sm" fw={500}>
                            {t('periodComparison.timeDimension')}
                        </Text>
                        <Text size="sm">{singleTimeDimension.label}</Text>
                    </Stack>
                ) : (
                    <Select
                        label={t('periodComparison.timeDimension')}
                        placeholder={
                            canConfigure
                                ? t('periodComparison.selectTimeDimension')
                                : t('periodComparison.addTimeDimension')
                        }
                        data={selectData}
                        value={selectedTimeDimensionId}
                        onChange={setSelectedTimeDimensionId}
                        disabled={!canConfigure}
                        renderOption={renderSelectOption}
                        searchable
                        clearable
                    />
                )}

                <Group gap="xs" align="center">
                    <NumberInput
                        label={t('periodComparison.offset')}
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
                            ? t('periodComparison.granularity', {
                                  granularity: selectedGranularityLabel,
                              })
                            : t('periodComparison.granularityFromDimension')}
                    </Text>
                </Group>

                {selectedGranularity && timeDimensionId ? (
                    <Text size="sm" c="dimmed">
                        <Trans
                            t={t}
                            i18nKey="periodComparison.willCreate"
                            values={{
                                metric: metric.label,
                                period: getPopPeriodLabel(
                                    selectedGranularity,
                                    effectivePeriodOffset,
                                ),
                            }}
                            components={{ name: <Text span fw={600} /> }}
                        />
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
