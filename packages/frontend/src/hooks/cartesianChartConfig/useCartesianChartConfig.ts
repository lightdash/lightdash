import {
    getSeriesId,
    isCompleteLayout,
    isNumericItem,
    type CartesianChart,
    type ConditionalFormattingConfig,
    type EChartsConfig,
    type EchartsGrid,
    type EchartsLegend,
    type ItemsMap,
    type MergeFieldOrigins,
    type MetricQuery,
    type RowLimit,
    type Series,
    type SeriesMetadata,
    type StackType,
    type TableCalculationMetadata,
    type TooltipSortBy,
    type XAxis,
    type XAxisSort,
} from '@lightdash/common';
import {
    applyReferenceLines,
    buildCartesianSeries,
    buildValidCartesianConfig,
    EMPTY_CARTESIAN_CHART_CONFIG,
    EMPTY_X_AXIS,
    getAvailableCartesianFields,
    getCartesianChartType,
    getPendingFieldIds,
    getXAxisSortConfig,
    hasCartesianCustomColorsStacking,
    isColorByCategoryEligible,
    isConditionalFormattingEligible,
    repairCartesianLayout,
    repairConditionalFormattings,
    type CartesianTypeOptions,
    type ReferenceLineField,
} from '@lightdash/visualization/editor';
import {
    useCallback,
    useEffect,
    useMemo,
    type Dispatch,
    type SetStateAction,
} from 'react';
import {
    buildCartesianEditorState,
    cartesianEditorActions,
    selectCartesianEditor,
    useEditorFieldSetter,
    useEditorState,
    useVisualizationDispatch,
    type CartesianEditorState,
} from '../../features/visualization/store';
import type { InfiniteQueryResults } from '../useQueryResults';

export {
    applyReferenceLines,
    EMPTY_CARTESIAN_CHART_CONFIG,
    EMPTY_X_AXIS,
    type CartesianTypeOptions,
};

type Args = {
    initialChartConfig: CartesianChart | undefined;
    pivotKeys: string[] | undefined;
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
              resolvedTimezone?: string;
              fieldOrigins?: MergeFieldOrigins;
          })
        | undefined;
    columnOrder: string[];
    itemsMap: ItemsMap | undefined;
    stacking: boolean | StackType | undefined;
    cartesianType: CartesianTypeOptions | undefined;
    colorPalette: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
    /** The not-yet-run metric query; its fields count as valid layout
     *  references so a just-added field survives until results land. */
    unsavedMetricQuery?: MetricQuery;
};

/**
 * The explorer's editable cartesian config. Every derivation (default
 * layout, expected series, eligibility repairs, the valid config) runs
 * through `@lightdash/visualization`; this hook only holds the editor
 * state and its mutators.
 */
const useCartesianChartConfig = ({
    initialChartConfig,
    pivotKeys,
    resultsData,
    columnOrder,
    itemsMap,
    stacking,
    cartesianType,
    tableCalculationsMetadata,
    unsavedMetricQuery,
}: Args) => {
    const {
        columnLimit,
        dirtyLayout,
        dirtyMetadata,
        conditionalFormattings,
        dirtyEchartsConfig,
        isStacked,
        rowLimit,
        referenceLines,
        tooltip,
        tooltipSort,
    } = useEditorState(selectCartesianEditor, cartesianEditorActions, () =>
        buildCartesianEditorState(initialChartConfig),
    );
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<CartesianEditorState>(
        selectCartesianEditor,
        cartesianEditorActions.set,
    );

    const setColumnLimit: Dispatch<SetStateAction<number | undefined>> =
        useCallback((value) => set('columnLimit', value), [set]);
    const setRowLimit: Dispatch<SetStateAction<RowLimit | undefined>> =
        useCallback((value) => set('rowLimit', value), [set]);
    const setReferenceLines: Dispatch<SetStateAction<ReferenceLineField[]>> =
        useCallback((value) => set('referenceLines', value), [set]);
    const setTooltip: Dispatch<SetStateAction<string | undefined>> =
        useCallback((value) => set('tooltip', value), [set]);
    const setTooltipSort: Dispatch<SetStateAction<TooltipSortBy | undefined>> =
        useCallback((value) => set('tooltipSort', value), [set]);

    const mergeLayout = useCallback(
        (patch: Partial<CartesianChart['layout']>) =>
            dispatch(cartesianEditorActions.layoutMerge(patch)),
        [dispatch],
    );
    const mergeEcharts = useCallback(
        (patch: Partial<CartesianChart['eChartsConfig']>) =>
            dispatch(cartesianEditorActions.echartsMerge(patch)),
        [dispatch],
    );
    const mergeFirstXAxis = useCallback(
        (patch: Partial<XAxis>) =>
            dispatch(cartesianEditorActions.firstXAxisMerge(patch)),
        [dispatch],
    );
    const mergeAxis = useCallback(
        (
            axis: 'xAxis' | 'yAxis',
            index: number,
            patch: Partial<NonNullable<EChartsConfig['yAxis']>[number]>,
        ) => dispatch(cartesianEditorActions.axisMerge({ axis, index, patch })),
        [dispatch],
    );

    const setLegend = useCallback(
        (legend: EchartsLegend) => {
            const removePropertiesWithAuto = Object.entries(
                legend,
            ).reduce<EchartsLegend>((acc, [key, value]) => {
                if (value === 'auto') return acc;
                return { ...acc, [key]: value };
            }, {});
            mergeEcharts({ legend: removePropertiesWithAuto });
        },
        [mergeEcharts],
    );

    const setGrid = useCallback(
        (grid: EchartsGrid) => mergeEcharts({ grid }),
        [mergeEcharts],
    );

    const setXAxisName = useCallback(
        (name: string) => mergeFirstXAxis({ name }),
        [mergeFirstXAxis],
    );

    const setYAxisName = useCallback(
        (index: number, name: string) => mergeAxis('yAxis', index, { name }),
        [mergeAxis],
    );

    const setYMinValue = useCallback(
        (index: number, value: string | undefined) =>
            mergeAxis('yAxis', index, { min: value }),
        [mergeAxis],
    );

    const setYMaxValue = useCallback(
        (index: number, value: string | undefined) =>
            mergeAxis('yAxis', index, { max: value }),
        [mergeAxis],
    );

    const setYMinInterval = useCallback(
        (index: number, value: number | undefined) =>
            mergeAxis('yAxis', index, { minInterval: value }),
        [mergeAxis],
    );

    const setXMinValue = useCallback(
        (index: number, value: string | undefined) =>
            mergeAxis('xAxis', index, { min: value }),
        [mergeAxis],
    );

    const setXMinInterval = useCallback(
        (index: number, value: number | undefined) =>
            mergeAxis('xAxis', index, { minInterval: value }),
        [mergeAxis],
    );

    const setXMinOffsetValue = useCallback(
        (index: number, value: string | undefined) =>
            mergeAxis('xAxis', index, { minOffset: value }),
        [mergeAxis],
    );

    const setXMaxValue = useCallback(
        (index: number, value: string | undefined) =>
            mergeAxis('xAxis', index, { max: value }),
        [mergeAxis],
    );

    const setXMaxOffsetValue = useCallback(
        (index: number, value: string | undefined) =>
            mergeAxis('xAxis', index, { maxOffset: value }),
        [mergeAxis],
    );

    const setXField = useCallback(
        (xField: string | undefined) => mergeLayout({ xField }),
        [mergeLayout],
    );

    const setShowGridX = useCallback(
        (show: boolean) => mergeLayout({ showGridX: show }),
        [mergeLayout],
    );
    const setShowGridY = useCallback(
        (show: boolean) => mergeLayout({ showGridY: show }),
        [mergeLayout],
    );
    const setShowXAxis = useCallback(
        (hide: boolean) => mergeLayout({ showXAxis: hide }),
        [mergeLayout],
    );
    const setShowYAxis = useCallback(
        (hide: boolean) => mergeLayout({ showYAxis: hide }),
        [mergeLayout],
    );
    const setShowLeftYAxis = useCallback(
        (show: boolean) => mergeLayout({ showLeftYAxis: show }),
        [mergeLayout],
    );
    const setShowRightYAxis = useCallback(
        (show: boolean) => mergeLayout({ showRightYAxis: show }),
        [mergeLayout],
    );
    const setShowAxisTicks = useCallback(
        (show: boolean) => mergeEcharts({ showAxisTicks: show }),
        [mergeEcharts],
    );

    const setConnectNulls = useCallback(
        (connect: boolean) => mergeLayout({ connectNulls: connect }),
        [mergeLayout],
    );

    const setShowIncompletePeriod = useCallback(
        (show: boolean) => mergeLayout({ showIncompletePeriod: show }),
        [mergeLayout],
    );

    const setColorByCategory = useCallback(
        (enabled: boolean) => mergeLayout({ colorByCategory: enabled }),
        [mergeLayout],
    );

    const setCategoryColorOverride = useCallback(
        (categoryValue: string, color: string) =>
            dispatch(
                cartesianEditorActions.categoryColorOverrideSet({
                    categoryValue,
                    color,
                }),
            ),
        [dispatch],
    );

    const setAllCategoryColorOverrides = useCallback(
        (overrides: Record<string, string>) =>
            mergeLayout({ categoryColorOverrides: overrides }),
        [mergeLayout],
    );

    const onSetConditionalFormattings = useCallback(
        (configs: ConditionalFormattingConfig[]) =>
            dispatch(cartesianEditorActions.conditionalFormattingsSet(configs)),
        [dispatch],
    );

    const setAxisLabelFontSize = useCallback(
        (fontSize: number | undefined) =>
            mergeEcharts({ axisLabelFontSize: fontSize }),
        [mergeEcharts],
    );

    const setAxisTitleFontSize = useCallback(
        (fontSize: number | undefined) =>
            mergeEcharts({ axisTitleFontSize: fontSize }),
        [mergeEcharts],
    );

    const setXAxisSort = useCallback(
        (sort: XAxisSort) => mergeFirstXAxis(getXAxisSortConfig(sort)),
        [mergeFirstXAxis],
    );
    const setXAxisLabelRotation = useCallback(
        (rotation: number) => mergeFirstXAxis({ rotate: rotation }),
        [mergeFirstXAxis],
    );
    const setScrollableChart = useCallback(
        (enableDataZoom: boolean) => mergeFirstXAxis({ enableDataZoom }),
        [mergeFirstXAxis],
    );
    const setXAxisTreatAsCategory = useCallback(
        (treatAsCategory: boolean) => mergeFirstXAxis({ treatAsCategory }),
        [mergeFirstXAxis],
    );
    const setDataZoomAnchor = useCallback(
        (dataZoomAnchor: 'start' | 'end') =>
            mergeFirstXAxis({ dataZoomAnchor }),
        [mergeFirstXAxis],
    );
    const setDataZoomItemCount = useCallback(
        (dataZoomItemCount: number) => mergeFirstXAxis({ dataZoomItemCount }),
        [mergeFirstXAxis],
    );
    const addSingleSeries = useCallback(
        (yField: string) =>
            dispatch(cartesianEditorActions.singleSeriesAdd(yField)),
        [dispatch],
    );

    const removeSingleSeries = useCallback(
        (index: number) =>
            dispatch(cartesianEditorActions.singleSeriesRemove(index)),
        [dispatch],
    );

    const updateYField = useCallback(
        (index: number, fieldId: string) =>
            dispatch(cartesianEditorActions.yFieldUpdate({ index, fieldId })),
        [dispatch],
    );

    const setType = useCallback(
        (type: Series['type'], flipAxes: boolean, hasAreaStyle: boolean) =>
            dispatch(
                cartesianEditorActions.typeApply({
                    type,
                    flipAxes,
                    hasAreaStyle,
                }),
            ),
        [dispatch],
    );

    useEffect(() => {
        if (cartesianType !== undefined) {
            setType(
                cartesianType.type,
                cartesianType.flipAxes,
                cartesianType.hasAreaStyle,
            );
        }
    }, [cartesianType, setType]);

    const setFlipAxis = useCallback(
        (flipAxes: boolean) => mergeLayout({ flipAxes }),
        [mergeLayout],
    );

    const updateAllGroupedSeries = useCallback(
        (fieldKey: string, updateSeries: Partial<Series>) =>
            dispatch(
                cartesianEditorActions.groupedSeriesUpdateAll({
                    fieldKey,
                    updateSeries,
                }),
            ),
        [dispatch],
    );

    const updateSingleSeries = useCallback(
        (updatedSeries: Series) =>
            dispatch(cartesianEditorActions.singleSeriesUpdate(updatedSeries)),
        [dispatch],
    );

    const getSingleSeries = useCallback(
        (series: Series) =>
            dirtyEchartsConfig?.series?.find(
                (s) => getSeriesId(s) === getSeriesId(series),
            ),
        [dirtyEchartsConfig?.series],
    );

    const updateSeries = useCallback(
        (series: Series[]) =>
            dispatch(cartesianEditorActions.seriesSet(series)),
        [dispatch],
    );

    const setStacking = useCallback(
        (stack: boolean | StackType) =>
            // The y fields the stack applies to are read once, from the
            // layout at call time, as they always were.
            dispatch(
                cartesianEditorActions.stackingApply({
                    stack,
                    yFields: dirtyLayout?.yField,
                    pivotKeys,
                }),
            ),
        [dispatch, dirtyLayout?.yField, pivotKeys],
    );

    useEffect(() => {
        // If the xField is a table calculation and its type is a number, do not stack
        // This is computed on first load and also when the table calculation is updated in edit mode
        if (stacking === false) return;
        const tableCalculation =
            resultsData?.metricQuery?.tableCalculations?.find(
                (tc) => tc.name === dirtyLayout?.xField,
            );
        if (tableCalculation) {
            const isNumber = isNumericItem(tableCalculation);
            if (isNumber) setStacking(false);
        }
    }, [
        dirtyLayout?.xField,
        resultsData?.metricQuery?.tableCalculations,
        stacking,
        setStacking,
    ]);

    useEffect(() => {
        if (stacking !== undefined) {
            setStacking(stacking);
        }
    }, [stacking, setStacking]);

    const { availableFields, availableDimensions, availableMetrics } = useMemo(
        () =>
            getAvailableCartesianFields({
                metricQuery: resultsData?.metricQuery,
                itemsMap,
                columnOrder,
            }),
        [resultsData?.metricQuery, itemsMap, columnOrder],
    );

    // `availableFields` only knows the last run; a field just added from a
    // config picker must not be stripped before its results land.
    const pendingFieldIds = useMemo(
        () => getPendingFieldIds(unsavedMetricQuery),
        [unsavedMetricQuery],
    );

    // Set fallout layout values
    // https://www.notion.so/lightdash/Default-chart-configurations-5d3001af990d4b6fa990dba4564540f6
    useEffect(() => {
        if (availableFields.length > 0) {
            set('dirtyLayout', (prev) =>
                repairCartesianLayout({
                    layout: prev,
                    availableFields,
                    availableDimensions,
                    availableMetrics,
                    tableCalculationsMetadata,
                    pendingFieldIds,
                }),
            );
        }
    }, [
        availableDimensions,
        availableFields,
        availableMetrics,
        pivotKeys,
        tableCalculationsMetadata,
        pendingFieldIds,
        itemsMap,
        set,
    ]);

    // Track series hidden states to trigger reference line redistribution
    const seriesHiddenStatesKey = useMemo(() => {
        const hiddenStates =
            dirtyEchartsConfig?.series?.map((s) => ({
                id: getSeriesId(s),
                hidden: !!s.hidden,
            })) || [];
        // Use JSON.stringify for stable comparison
        return JSON.stringify(hiddenStates);
    }, [dirtyEchartsConfig?.series]);

    // Generate expected series
    useEffect(() => {
        if (isCompleteLayout(dirtyLayout) && resultsData?.hasFetchedAllRows) {
            set('dirtyEchartsConfig', (prev) => ({
                ...prev,
                series: buildCartesianSeries({
                    layout: dirtyLayout,
                    existingSeries: prev?.series,
                    cartesianType,
                    isStacked,
                    pivotKeys,
                    resultsData,
                    itemsMap,
                    columnLimit,
                    referenceLines,
                }),
            }));
        }
    }, [
        dirtyLayout,
        pivotKeys,
        resultsData,
        availableDimensions,
        isStacked,
        referenceLines,
        itemsMap,
        seriesHiddenStatesKey, // Re-run when series hidden states change
        columnLimit,
        cartesianType,
        set,
    ]);

    const dirtyChartType = useMemo(
        () => getCartesianChartType(dirtyEchartsConfig?.series),
        [dirtyEchartsConfig?.series],
    );

    const hasCustomColorsStacking = useMemo(
        () =>
            hasCartesianCustomColorsStacking(
                dirtyEchartsConfig?.series,
                dirtyLayout?.stack,
            ),
        [dirtyEchartsConfig?.series, dirtyLayout?.stack],
    );

    const isConditionalFormattingAllowed = useMemo(
        () =>
            isConditionalFormattingEligible(
                dirtyEchartsConfig?.series,
                pivotKeys,
            ),
        [dirtyEchartsConfig?.series, pivotKeys],
    );

    const isColorByCategoryAllowed = useMemo(
        () =>
            isColorByCategoryEligible({
                series: dirtyEchartsConfig?.series,
                pivotKeys,
                layout: dirtyLayout,
            }),
        [dirtyEchartsConfig?.series, pivotKeys, dirtyLayout],
    );

    useEffect(() => {
        if (isColorByCategoryAllowed) return;

        if (
            !dirtyLayout?.colorByCategory &&
            !dirtyLayout?.categoryColorOverrides
        ) {
            return;
        }

        mergeLayout({
            colorByCategory: undefined,
            categoryColorOverrides: undefined,
        });
    }, [
        isColorByCategoryAllowed,
        dirtyLayout?.colorByCategory,
        dirtyLayout?.categoryColorOverrides,
        mergeLayout,
    ]);

    useEffect(() => {
        if (isConditionalFormattingAllowed) return;

        set('conditionalFormattings', (prev) =>
            prev.length === 0 ? prev : [],
        );
    }, [isConditionalFormattingAllowed, set]);

    // Repair configs whose target no longer exists on the chart (e.g. the
    // metric was swapped or removed) by pointing them at the first metric.
    useEffect(() => {
        if (!isConditionalFormattingAllowed) return;

        const yFields = dirtyLayout?.yField ?? [];
        if (!yFields[0]) return;

        set('conditionalFormattings', (prev) =>
            repairConditionalFormattings({
                conditionalFormattings: prev,
                yFields,
                hasCustomColorsStacking,
            }),
        );
    }, [
        isConditionalFormattingAllowed,
        hasCustomColorsStacking,
        dirtyLayout?.yField,
        set,
    ]);

    const validConfig: CartesianChart = useMemo(
        () =>
            buildValidCartesianConfig({
                layout: dirtyLayout,
                eChartsConfig: dirtyEchartsConfig,
                conditionalFormattings,
                metadata: dirtyMetadata,
                tooltip,
                tooltipSort,
                rowLimit,
                columnLimit,
            }),
        [
            dirtyLayout,
            dirtyEchartsConfig,
            conditionalFormattings,
            dirtyMetadata,
            tooltip,
            tooltipSort,
            rowLimit,
            columnLimit,
        ],
    );

    const updateMetadata = useCallback(
        (metadata: Record<string, SeriesMetadata>) =>
            set('dirtyMetadata', metadata),
        [set],
    );

    return useMemo(
        () => ({
            validConfig,
            dirtyChartType,
            dirtyLayout,
            dirtyEchartsConfig,
            dirtyMetadata,
            setXField,
            setType,
            setXAxisName,
            setYAxisName,
            setStacking,
            isStacked,
            addSingleSeries,
            updateSingleSeries,
            getSingleSeries,
            removeSingleSeries,
            updateAllGroupedSeries,
            updateYField,
            setFlipAxis,
            setYMinValue,
            setYMaxValue,
            setYMinInterval,
            setXMinValue,
            setXMinInterval,
            setXMinOffsetValue,
            setXMaxValue,
            setXMaxOffsetValue,
            setLegend,
            setGrid,
            setShowGridX,
            setShowGridY,
            setShowXAxis,
            setShowYAxis,
            setShowLeftYAxis,
            setShowRightYAxis,
            setShowAxisTicks,
            setConnectNulls,
            setShowIncompletePeriod,
            setColorByCategory,
            setCategoryColorOverride,
            setAllCategoryColorOverrides,
            conditionalFormattings,
            onSetConditionalFormattings,
            setAxisLabelFontSize,
            setAxisTitleFontSize,
            setXAxisSort,
            setXAxisLabelRotation,
            setScrollableChart,
            setXAxisTreatAsCategory,
            setDataZoomAnchor,
            setDataZoomItemCount,
            updateSeries,
            referenceLines,
            setReferenceLines,
            tooltip,
            setTooltip,
            tooltipSort,
            setTooltipSort,
            updateMetadata,
            rowLimit,
            setRowLimit,
            columnLimit,
            setColumnLimit,
        }),
        [
            validConfig,
            dirtyChartType,
            dirtyLayout,
            dirtyEchartsConfig,
            dirtyMetadata,
            setXField,
            setType,
            setXAxisName,
            setYAxisName,
            setStacking,
            isStacked,
            addSingleSeries,
            updateSingleSeries,
            getSingleSeries,
            removeSingleSeries,
            updateAllGroupedSeries,
            updateYField,
            setFlipAxis,
            setYMinValue,
            setYMaxValue,
            setYMinInterval,
            setXMinValue,
            setXMinInterval,
            setXMinOffsetValue,
            setXMaxValue,
            setXMaxOffsetValue,
            setLegend,
            setGrid,
            setShowGridX,
            setShowGridY,
            setShowXAxis,
            setShowYAxis,
            setShowLeftYAxis,
            setShowRightYAxis,
            setShowAxisTicks,
            setConnectNulls,
            setShowIncompletePeriod,
            setColorByCategory,
            setCategoryColorOverride,
            setAllCategoryColorOverrides,
            conditionalFormattings,
            onSetConditionalFormattings,
            setAxisLabelFontSize,
            setAxisTitleFontSize,
            setXAxisSort,
            setXAxisLabelRotation,
            setScrollableChart,
            setXAxisTreatAsCategory,
            setDataZoomAnchor,
            setDataZoomItemCount,
            updateSeries,
            referenceLines,
            setReferenceLines,
            tooltip,
            setTooltip,
            tooltipSort,
            setTooltipSort,
            updateMetadata,
            rowLimit,
            setRowLimit,
            columnLimit,
            setColumnLimit,
        ],
    );
};

export default useCartesianChartConfig;
