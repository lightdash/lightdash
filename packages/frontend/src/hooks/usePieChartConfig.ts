import {
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
    type ParametersValuesMap,
    type PieChart,
    type PieChartLegendPosition,
    type PieChartValueOptions,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import {
    buildValidPieConfig,
    getPieChartData,
    getPieGroupColorDefaults,
    getPieSelectedMetric,
    getSortedPieGroupLabels,
    isPieValueOptionOverridden,
    repairPieGroupFieldIds,
    repairPieMetricId,
    type PieChartDataPoint,
} from '@lightdash/visualization/editor';
import { useDebouncedValue } from '@mantine/hooks';
import isEqual from 'lodash/isEqual';
import { useCallback, useEffect, useMemo } from 'react';
import {
    buildPieEditorState,
    pieEditorActions,
    selectPieEditor,
    useEditorFieldSetter,
    useEditorState,
    useVisualizationDispatch,
    type PieEditorState,
} from '../features/visualization/store';
import { type InfiniteQueryResults } from './useQueryResults';

type PieChartConfig = {
    validConfig: PieChart;

    groupFieldIds: (string | null)[];
    groupAdd: (dimensionId?: string) => void;
    groupChange: (prevDimensionId: string, newDimensionId: string) => void;
    groupRemove: (dimensionId: string) => void;

    metricId: string | null;
    selectedMetric: Metric | TableCalculation | undefined;
    metricChange: (metricId: string | null) => void;

    isDonut: boolean;
    toggleDonut: () => void;

    valueLabel: PieChartValueOptions['valueLabel'];
    valueLabelChange: (valueLabel: PieChartValueOptions['valueLabel']) => void;
    valueLabelColor: PieChartValueOptions['valueLabelColor'];
    valueLabelColorChange: (color: string | undefined) => void;
    showValue: PieChartValueOptions['showValue'];
    toggleShowValue: () => void;
    showPercentage: PieChartValueOptions['showPercentage'];
    toggleShowPercentage: () => void;

    isValueLabelOverriden: boolean;
    isShowValueOverriden: boolean;
    isShowPercentageOverriden: boolean;

    sortedGroupLabels: string[];
    groupLabelOverrides: Record<string, string>;
    groupLabelChange: (prevValue: any, newValue: any) => void;
    groupColorOverrides: Record<string, string>;
    groupColorDefaults: Record<string, string>;
    groupColorChange: (prevValue: any, newValue: any) => void;
    groupValueOptionOverrides: Record<string, Partial<PieChartValueOptions>>;
    groupValueOptionChange: (
        label: string,
        value: Partial<PieChartValueOptions>,
    ) => void;
    groupSortOverrides: string[];
    groupSortChange: (oldIndex: number, newIndex: number) => void;

    showLegend: boolean;
    toggleShowLegend: () => void;
    legendPosition: PieChartLegendPosition;
    legendPositionChange: (position: PieChartLegendPosition) => void;
    legendMaxItemLength: number | undefined;
    legendMaxItemLengthChange: (length: number | undefined) => void;
    data: PieChartDataPoint[];
};

export type PieChartConfigFn = (
    resultsData:
        | (InfiniteQueryResults & { resolvedTimezone?: string })
        | undefined,
    pieChartConfig: PieChart | undefined,
    itemsMap: ItemsMap | undefined,
    dimensions: Record<string, CustomDimension | Dimension>,
    numericMetrics: Record<string, Metric | TableCalculation>,
    colorPalette: string[],
    tableCalculationsMetadata?: TableCalculationMetadata[],
    parameters?: ParametersValuesMap,
    /** The not-yet-run metric query; its fields count as valid group/metric
     *  references so a just-added field survives until results land. */
    unsavedMetricQuery?: MetricQuery,
) => PieChartConfig;

const usePieChartConfig: PieChartConfigFn = (
    resultsData,
    pieChartConfig,
    itemsMap,
    dimensions,
    numericMetrics,
    colorPalette,
    tableCalculationsMetadata,
    parameters,
    unsavedMetricQuery,
) => {
    const {
        groupFieldIds,
        metricId,
        isDonut,
        valueLabel,
        showValue,
        showPercentage,
        valueLabelColor,
        groupLabelOverrides,
        groupColorOverrides,
        groupValueOptionOverrides,
        groupSortOverrides,
        showLegend,
        legendPosition,
        legendMaxItemLength,
    } = useEditorState(selectPieEditor, pieEditorActions, () =>
        buildPieEditorState(pieChartConfig),
    );
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<PieEditorState>(
        selectPieEditor,
        pieEditorActions.set,
    );

    const [debouncedGroupLabelOverrides] = useDebouncedValue(
        groupLabelOverrides,
        500,
    );

    const [debouncedGroupColorOverrides] = useDebouncedValue(
        groupColorOverrides,
        500,
    );

    const dimensionIds = useMemo(() => Object.keys(dimensions), [dimensions]);

    const allNumericMetricIds = useMemo(
        () => Object.keys(numericMetrics),
        [numericMetrics],
    );

    const selectedMetric = useMemo(
        () => getPieSelectedMetric(itemsMap, metricId),
        [itemsMap, metricId],
    );

    const isLoading = !resultsData;

    // The pools above only know the last run; a field just added from the
    // config picker must not be dropped before its results land.
    const pendingDimensionIds = useMemo(
        () => new Set(unsavedMetricQuery?.dimensions),
        [unsavedMetricQuery?.dimensions],
    );
    const pendingMetricIds = useMemo(
        () => new Set(unsavedMetricQuery?.metrics),
        [unsavedMetricQuery?.metrics],
    );

    useEffect(() => {
        if (isLoading || dimensionIds.length === 0) return;

        const newGroupFieldIds = repairPieGroupFieldIds({
            groupFieldIds,
            dimensionIds,
            pendingDimensionIds,
        });

        if (isEqual(newGroupFieldIds, groupFieldIds)) return;

        set('groupFieldIds', newGroupFieldIds);
    }, [isLoading, dimensionIds, groupFieldIds, pendingDimensionIds, set]);

    useEffect(() => {
        if (isLoading || allNumericMetricIds.length === 0) return;

        const nextMetricId = repairPieMetricId({
            metricId,
            allNumericMetricIds,
            pendingMetricIds,
            tableCalculationsMetadata,
        });
        if (nextMetricId === metricId) return;

        set('metricId', nextMetricId);
    }, [
        allNumericMetricIds,
        isLoading,
        metricId,
        pendingMetricIds,
        tableCalculationsMetadata,
        set,
    ]);

    const isValueLabelOverriden = useMemo(
        () =>
            isPieValueOptionOverridden(groupValueOptionOverrides, 'valueLabel'),
        [groupValueOptionOverrides],
    );

    const isShowValueOverriden = useMemo(
        () =>
            isPieValueOptionOverridden(groupValueOptionOverrides, 'showValue'),
        [groupValueOptionOverrides],
    );

    const isShowPercentageOverriden = useMemo(
        () =>
            isPieValueOptionOverridden(
                groupValueOptionOverrides,
                'showPercentage',
            ),
        [groupValueOptionOverrides],
    );

    const data = useMemo(
        () =>
            getPieChartData({
                resultsData,
                groupFieldIds,
                metricId,
                selectedMetric,
                parameters,
            }),
        [resultsData, groupFieldIds, selectedMetric, metricId, parameters],
    );

    const groupLabels = useMemo(() => {
        return data.map(({ name }) => name);
    }, [data]);

    const sortedGroupLabels = useMemo(
        () => getSortedPieGroupLabels(groupSortOverrides, groupLabels),
        [groupSortOverrides, groupLabels],
    );

    const groupColorDefaults = useMemo(
        () => getPieGroupColorDefaults(groupLabels, colorPalette),
        [groupLabels, colorPalette],
    );

    const handleGroupAdd = useCallback(
        (dimensionId?: string) =>
            dispatch(pieEditorActions.groupAdd({ dimensionId, dimensionIds })),
        [dispatch, dimensionIds],
    );

    const handleGroupSortChange = useCallback(
        (oldIndex: number, newIndex: number) =>
            dispatch(
                pieEditorActions.groupSortChange({
                    oldIndex,
                    newIndex,
                    groupLabels,
                }),
            ),
        [dispatch, groupLabels],
    );

    const handlers = useMemo(
        () => ({
            groupChange: (prevDimensionId: string, newDimensionId: string) =>
                dispatch(
                    pieEditorActions.groupChange({
                        prevDimensionId,
                        newDimensionId,
                    }),
                ),
            groupRemove: (dimensionId: string) =>
                dispatch(pieEditorActions.groupRemove(dimensionId)),
            metricChange: (value: string | null) => set('metricId', value),
            toggleDonut: () => dispatch(pieEditorActions.toggleDonut()),
            valueLabelChange: (value: PieChartValueOptions['valueLabel']) =>
                dispatch(pieEditorActions.valueLabelChange(value)),
            valueLabelColorChange: (color: string | undefined) =>
                dispatch(pieEditorActions.valueLabelColorChange(color)),
            toggleShowValue: () => dispatch(pieEditorActions.toggleShowValue()),
            toggleShowPercentage: () =>
                dispatch(pieEditorActions.toggleShowPercentage()),
            groupLabelChange: (key: string, value: string) =>
                dispatch(pieEditorActions.groupLabelChange({ key, value })),
            groupColorChange: (key: string, value: string) =>
                dispatch(pieEditorActions.groupColorChange({ key, value })),
            groupValueOptionChange: (
                label: string,
                value: Partial<PieChartValueOptions>,
            ) =>
                dispatch(
                    pieEditorActions.groupValueOptionChange({ label, value }),
                ),
            toggleShowLegend: () =>
                dispatch(pieEditorActions.toggleShowLegend()),
            legendPositionChange: (position: PieChartLegendPosition) =>
                set('legendPosition', position),
            legendMaxItemLengthChange: (length: number | undefined) =>
                set('legendMaxItemLength', length),
        }),
        [dispatch, set],
    );

    const groupFieldIdsCopy = useMemo(
        () => Array.from(groupFieldIds),
        [groupFieldIds],
    );

    const validConfig: PieChart = useMemo(
        () =>
            buildValidPieConfig({
                groupFieldIds,
                metricId,
                isDonut,
                valueLabel,
                showValue,
                showPercentage,
                valueLabelColor,
                groupLabels,
                groupLabelOverrides: debouncedGroupLabelOverrides,
                groupColorOverrides: debouncedGroupColorOverrides,
                groupValueOptionOverrides,
                groupSortOverrides,
                showLegend,
                legendPosition,
                legendMaxItemLength,
            }),
        [
            groupFieldIds,
            metricId,
            isDonut,
            valueLabel,
            showValue,
            showPercentage,
            valueLabelColor,
            groupLabels,
            debouncedGroupLabelOverrides,
            debouncedGroupColorOverrides,
            groupValueOptionOverrides,
            groupSortOverrides,
            showLegend,
            legendPosition,
            legendMaxItemLength,
        ],
    );

    return useMemo(
        () => ({
            validConfig,

            groupFieldIds: groupFieldIdsCopy,
            groupAdd: handleGroupAdd,

            selectedMetric,
            metricId,

            isDonut,

            valueLabel,
            valueLabelColor,
            showValue,
            showPercentage,

            isValueLabelOverriden,
            isShowValueOverriden,
            isShowPercentageOverriden,

            sortedGroupLabels,
            groupLabelOverrides,
            groupColorOverrides,
            groupColorDefaults,
            groupValueOptionOverrides,
            groupSortOverrides,
            groupSortChange: handleGroupSortChange,

            showLegend,
            legendPosition,
            legendMaxItemLength,
            data,
            ...handlers,
        }),
        [
            validConfig,
            groupFieldIdsCopy,
            handleGroupAdd,
            selectedMetric,
            metricId,
            isDonut,
            valueLabel,
            valueLabelColor,
            showValue,
            showPercentage,
            isValueLabelOverriden,
            isShowValueOverriden,
            isShowPercentageOverriden,
            sortedGroupLabels,
            groupLabelOverrides,
            groupColorOverrides,
            groupColorDefaults,
            groupValueOptionOverrides,
            groupSortOverrides,
            handleGroupSortChange,
            showLegend,
            legendPosition,
            legendMaxItemLength,
            data,
            handlers,
        ],
    );
};

export default usePieChartConfig;
