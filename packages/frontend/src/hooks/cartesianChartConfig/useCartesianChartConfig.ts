import {
    getSeriesId,
    isCompleteLayout,
    isNumericItem,
    type CartesianChart,
    type ConditionalFormattingConfig,
    type EChartsConfig,
    type EchartsGrid,
    type EchartsLegend,
    type RowLimit,
    type Series,
    type SeriesMetadata,
    type StackType,
    type TooltipSortBy,
    type XAxis,
    type XAxisSort,
} from '@lightdash/common';
import {
    applyReferenceLines,
    buildCartesianSeries,
    EMPTY_CARTESIAN_CHART_CONFIG,
    EMPTY_X_AXIS,
    getXAxisSortConfig,
    type CartesianTypeOptions,
} from '@lightdash/visualization/editor';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
    useVisualizationServices,
} from '../../components/LightdashVisualization/useVisualizationContext';
import {
    cartesianEditorActions,
    selectCartesianConditionalFormattings,
    selectCartesianDirtyChartType,
    selectCartesianEditor,
    selectCartesianIntent,
    selectCartesianLayout,
    selectCartesianReconcileTrigger,
    selectCartesianRepairInputs,
    selectCartesianValidConfig,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    useVisualizationStore,
    type CartesianEditorState,
} from '../../features/visualization/store';
import {
    type CartesianRepairInputs,
    type ReferenceLineUpdate,
} from '../../features/visualization/store/cartesianEditorSlice';

export {
    applyReferenceLines,
    EMPTY_CARTESIAN_CHART_CONFIG,
    EMPTY_X_AXIS,
    type CartesianTypeOptions,
};

type YAxis = NonNullable<EChartsConfig['yAxis']>[number];

export type CartesianEditorActions = {
    setXField: (xField: string | undefined) => void;
    setType: (
        type: Series['type'],
        flipAxes: boolean,
        hasAreaStyle: boolean,
    ) => void;
    setXAxisName: (name: string) => void;
    setYAxisName: (index: number, name: string) => void;
    setStacking: (stack: boolean | StackType) => void;
    addSingleSeries: (yField: string) => void;
    updateSingleSeries: (series: Series) => void;
    removeSingleSeries: (index: number) => void;
    updateAllGroupedSeries: (
        fieldKey: string,
        updateSeries: Partial<Series>,
    ) => void;
    updateYField: (index: number, fieldId: string) => void;
    setFlipAxis: (flipAxes: boolean) => void;
    setYMinValue: (index: number, value: string | undefined) => void;
    setYMaxValue: (index: number, value: string | undefined) => void;
    setYMinInterval: (index: number, value: number | undefined) => void;
    setXMinValue: (index: number, value: string | undefined) => void;
    setXMinInterval: (index: number, value: number | undefined) => void;
    setXMinOffsetValue: (index: number, value: string | undefined) => void;
    setXMaxValue: (index: number, value: string | undefined) => void;
    setXMaxOffsetValue: (index: number, value: string | undefined) => void;
    setLegend: (legend: EchartsLegend) => void;
    setGrid: (grid: EchartsGrid) => void;
    mergeGrid: (patch: EchartsGrid) => void;
    setShowGridX: (show: boolean) => void;
    setShowGridY: (show: boolean) => void;
    setShowXAxis: (show: boolean) => void;
    setShowLeftYAxis: (show: boolean) => void;
    setShowRightYAxis: (show: boolean) => void;
    setShowAxisTicks: (show: boolean) => void;
    setConnectNulls: (connect: boolean) => void;
    setShowIncompletePeriod: (show: boolean) => void;
    setColorByCategory: (enabled: boolean) => void;
    setCategoryColorOverride: (categoryValue: string, color: string) => void;
    setAllCategoryColorOverrides: (overrides: Record<string, string>) => void;
    onSetConditionalFormattings: (
        configs: ConditionalFormattingConfig[],
    ) => void;
    setAxisLabelFontSize: (fontSize: number | undefined) => void;
    setAxisTitleFontSize: (fontSize: number | undefined) => void;
    setXAxisSort: (sort: XAxisSort) => void;
    setXAxisLabelRotation: (rotation: number) => void;
    setScrollableChart: (enableDataZoom: boolean) => void;
    setXAxisTreatAsCategory: (treatAsCategory: boolean) => void;
    setDataZoomAnchor: (dataZoomAnchor: 'start' | 'end') => void;
    setDataZoomItemCount: (dataZoomItemCount: number) => void;
    updateSeries: (series: Series[]) => void;
    addReferenceLine: (uuid: string) => void;
    removeReferenceLine: (lineId: string) => void;
    updateReferenceLine: (update: ReferenceLineUpdate) => void;
    setTooltip: (tooltip: string | undefined) => void;
    setTooltipSort: (tooltipSort: TooltipSortBy | undefined) => void;
    mergeMetadata: (metadata: Record<string, SeriesMetadata>) => void;
    setRowLimit: (rowLimit: RowLimit | undefined) => void;
    setColumnLimit: (columnLimit: number | undefined) => void;
};

const withoutAutoValues = (legend: EchartsLegend) =>
    Object.entries(legend).reduce<EchartsLegend>(
        (acc, [key, value]) =>
            value === 'auto' ? acc : { ...acc, [key]: value },
        {},
    );

/** Stable cartesian editor actions; what they need from the inputs is read at call time. */
export const useCartesianEditorActions = (): CartesianEditorActions => {
    const dispatch = useVisualizationDispatch();
    const { getInputs } = useVisualizationServices();
    const set = useEditorFieldSetter<CartesianEditorState>(
        cartesianEditorActions.set,
    );
    return useMemo(() => {
        const layout = (patch: Partial<CartesianChart['layout']>) =>
            dispatch(cartesianEditorActions.layoutMerge(patch));
        const echarts = (patch: Partial<CartesianChart['eChartsConfig']>) =>
            dispatch(cartesianEditorActions.echartsMerge(patch));
        const firstXAxis = (patch: Partial<XAxis>) =>
            dispatch(cartesianEditorActions.firstXAxisMerge(patch));
        const xAxis = (index: number, patch: Partial<XAxis>) =>
            dispatch(
                cartesianEditorActions.axisMerge({
                    axis: 'xAxis',
                    index,
                    patch,
                }),
            );
        const yAxis = (index: number, patch: Partial<YAxis>) =>
            dispatch(
                cartesianEditorActions.axisMerge({
                    axis: 'yAxis',
                    index,
                    patch,
                }),
            );
        return {
            setXField: (xField) => layout({ xField }),
            setType: (type, flipAxes, hasAreaStyle) =>
                dispatch(
                    cartesianEditorActions.typeApply({
                        type,
                        flipAxes,
                        hasAreaStyle,
                    }),
                ),
            setXAxisName: (name) => firstXAxis({ name }),
            setYAxisName: (index, name) => yAxis(index, { name }),
            setStacking: (stack) =>
                dispatch(
                    cartesianEditorActions.stackingApply({
                        stack,
                        pivotKeys: getInputs().pivotDimensions,
                    }),
                ),
            addSingleSeries: (yField) =>
                dispatch(cartesianEditorActions.singleSeriesAdd(yField)),
            updateSingleSeries: (series) =>
                dispatch(cartesianEditorActions.singleSeriesUpdate(series)),
            removeSingleSeries: (index) =>
                dispatch(cartesianEditorActions.singleSeriesRemove(index)),
            updateAllGroupedSeries: (fieldKey, updateSeries) =>
                dispatch(
                    cartesianEditorActions.groupedSeriesUpdateAll({
                        fieldKey,
                        updateSeries,
                    }),
                ),
            updateYField: (index, fieldId) =>
                dispatch(
                    cartesianEditorActions.yFieldUpdate({ index, fieldId }),
                ),
            setFlipAxis: (flipAxes) => layout({ flipAxes }),
            setYMinValue: (index, value) => yAxis(index, { min: value }),
            setYMaxValue: (index, value) => yAxis(index, { max: value }),
            setYMinInterval: (index, value) =>
                yAxis(index, { minInterval: value }),
            setXMinValue: (index, value) => xAxis(index, { min: value }),
            setXMinInterval: (index, value) =>
                xAxis(index, { minInterval: value }),
            setXMinOffsetValue: (index, value) =>
                xAxis(index, { minOffset: value }),
            setXMaxValue: (index, value) => xAxis(index, { max: value }),
            setXMaxOffsetValue: (index, value) =>
                xAxis(index, { maxOffset: value }),
            setLegend: (legend) =>
                echarts({ legend: withoutAutoValues(legend) }),
            setGrid: (grid) => echarts({ grid }),
            mergeGrid: (patch) =>
                dispatch(cartesianEditorActions.gridMerge(patch)),
            setShowGridX: (show) => layout({ showGridX: show }),
            setShowGridY: (show) => layout({ showGridY: show }),
            setShowXAxis: (show) => layout({ showXAxis: show }),
            setShowLeftYAxis: (show) => layout({ showLeftYAxis: show }),
            setShowRightYAxis: (show) => layout({ showRightYAxis: show }),
            setShowAxisTicks: (show) => echarts({ showAxisTicks: show }),
            setConnectNulls: (connect) => layout({ connectNulls: connect }),
            setShowIncompletePeriod: (show) =>
                layout({ showIncompletePeriod: show }),
            setColorByCategory: (enabled) =>
                layout({ colorByCategory: enabled }),
            setCategoryColorOverride: (categoryValue, color) =>
                dispatch(
                    cartesianEditorActions.categoryColorOverrideSet({
                        categoryValue,
                        color,
                    }),
                ),
            setAllCategoryColorOverrides: (overrides) =>
                layout({ categoryColorOverrides: overrides }),
            onSetConditionalFormattings: (configs) =>
                dispatch(
                    cartesianEditorActions.conditionalFormattingsSet(configs),
                ),
            setAxisLabelFontSize: (fontSize) =>
                echarts({ axisLabelFontSize: fontSize }),
            setAxisTitleFontSize: (fontSize) =>
                echarts({ axisTitleFontSize: fontSize }),
            setXAxisSort: (sort) => firstXAxis(getXAxisSortConfig(sort)),
            setXAxisLabelRotation: (rotation) =>
                firstXAxis({ rotate: rotation }),
            setScrollableChart: (enableDataZoom) =>
                firstXAxis({ enableDataZoom }),
            setXAxisTreatAsCategory: (treatAsCategory) =>
                firstXAxis({ treatAsCategory }),
            setDataZoomAnchor: (dataZoomAnchor) =>
                firstXAxis({ dataZoomAnchor }),
            setDataZoomItemCount: (dataZoomItemCount) =>
                firstXAxis({ dataZoomItemCount }),
            updateSeries: (series) =>
                dispatch(cartesianEditorActions.seriesSet(series)),
            addReferenceLine: (uuid) =>
                dispatch(cartesianEditorActions.referenceLineAdd(uuid)),
            removeReferenceLine: (lineId) =>
                dispatch(cartesianEditorActions.referenceLineRemove(lineId)),
            updateReferenceLine: (update) =>
                dispatch(cartesianEditorActions.referenceLineUpdate(update)),
            setTooltip: (tooltip) => set('tooltip', tooltip),
            setTooltipSort: (tooltipSort) => set('tooltipSort', tooltipSort),
            mergeMetadata: (metadata) =>
                dispatch(cartesianEditorActions.metadataMerge(metadata)),
            setRowLimit: (rowLimit) => set('rowLimit', rowLimit),
            setColumnLimit: (columnLimit) => set('columnLimit', columnLimit),
        };
    }, [dispatch, getInputs, set]);
};

/** Applies the gallery's intent, the layout fallbacks and the series the results imply; mounted once */
export const useCartesianEditorSync = () => {
    const dispatch = useVisualizationDispatch();
    const store = useVisualizationStore();
    const {
        resultsData,
        pivotDimensions: pivotKeys,
        itemsMap,
    } = useVisualizationInputs();
    const { stacking, cartesianType } = useVisualizationSelector(
        selectCartesianIntent,
    );
    const dirtyLayout = useVisualizationSelector(selectCartesianLayout);
    const xField = dirtyLayout?.xField;
    const yFields = dirtyLayout?.yField;

    useEffect(() => {
        if (cartesianType === undefined) return;
        dispatch(cartesianEditorActions.typeApply(cartesianType));
    }, [cartesianType, dispatch]);

    const applyStacking = useCallback(
        (stack: boolean | StackType) =>
            dispatch(
                cartesianEditorActions.stackingApply({ stack, pivotKeys }),
            ),
        [dispatch, pivotKeys],
    );

    const tableCalculations = resultsData?.metricQuery?.tableCalculations;
    useEffect(() => {
        // A numeric table calculation on the x axis cannot be stacked
        if (stacking === false) return;
        const tableCalculation = tableCalculations?.find(
            (tc) => tc.name === xField,
        );
        if (tableCalculation && isNumericItem(tableCalculation)) {
            applyStacking(false);
        }
    }, [xField, yFields, tableCalculations, stacking, applyStacking]);

    // Re-applied when the y fields or pivots change
    useEffect(() => {
        if (stacking !== undefined) applyStacking(stacking);
    }, [stacking, applyStacking, yFields]);

    const repairInputs = useVisualizationInputSelector(
        selectCartesianRepairInputs,
    );
    const reconcileTrigger = useVisualizationInputSelector(
        selectCartesianReconcileTrigger,
    );
    const repairedFor = useRef<CartesianRepairInputs | null>(null);

    useEffect(() => {
        // Layout fallbacks follow the query's fields, never an edit in progress
        if (repairedFor.current !== repairInputs) {
            repairedFor.current = repairInputs;
            dispatch(cartesianEditorActions.inputsChanged(repairInputs));
        }
        const editor = selectCartesianEditor(store.getState());
        const layout = editor.dirtyLayout;
        dispatch(
            cartesianEditorActions.seriesReconciled({
                expectedSeries:
                    isCompleteLayout(layout) && resultsData?.hasFetchedAllRows
                        ? buildCartesianSeries({
                              layout,
                              existingSeries: editor.dirtyEchartsConfig?.series,
                              cartesianType,
                              isStacked: editor.isStacked,
                              pivotKeys,
                              resultsData,
                              itemsMap,
                              columnLimit: editor.columnLimit,
                              referenceLines: editor.referenceLines,
                          })
                        : undefined,
                pivotKeys,
            }),
        );
    }, [
        repairInputs,
        reconcileTrigger,
        resultsData,
        pivotKeys,
        itemsMap,
        cartesianType,
        store,
        dispatch,
    ]);
};

/** Everything the cartesian chart body and the wide panels reads, re-rendering on every edit; config panels select their own fields */
const useCartesianChartConfig = () => {
    const {
        columnLimit,
        dirtyLayout,
        dirtyMetadata,
        dirtyEchartsConfig,
        isStacked,
        rowLimit,
        referenceLines,
        tooltip,
        tooltipSort,
    } = useVisualizationSelector(selectCartesianEditor);
    const conditionalFormattings = useVisualizationInputSelector(
        selectCartesianConditionalFormattings,
    );
    const validConfig = useVisualizationInputSelector(
        selectCartesianValidConfig,
    );
    const dirtyChartType = useVisualizationSelector(
        selectCartesianDirtyChartType,
    );
    const actions = useCartesianEditorActions();

    const getSingleSeries = useCallback(
        (series: Series) =>
            dirtyEchartsConfig?.series?.find(
                (s) => getSeriesId(s) === getSeriesId(series),
            ),
        [dirtyEchartsConfig?.series],
    );

    return useMemo(
        () => ({
            ...actions,
            validConfig,
            dirtyChartType,
            dirtyLayout,
            dirtyEchartsConfig,
            dirtyMetadata,
            isStacked,
            getSingleSeries,
            conditionalFormattings,
            referenceLines,
            tooltip,
            tooltipSort,
            rowLimit,
            columnLimit,
        }),
        [
            actions,
            validConfig,
            dirtyChartType,
            dirtyLayout,
            dirtyEchartsConfig,
            dirtyMetadata,
            isStacked,
            getSingleSeries,
            conditionalFormattings,
            referenceLines,
            tooltip,
            tooltipSort,
            rowLimit,
            columnLimit,
        ],
    );
};

export default useCartesianChartConfig;
