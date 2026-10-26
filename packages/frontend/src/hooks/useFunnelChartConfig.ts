import {
    type FunnelChart,
    type FunnelChartDataInput,
    type FunnelChartLegendPosition,
    type ItemsMap,
    type Metric,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import {
    buildValidFunnelConfig,
    getFunnelChartData,
    getFunnelColorDefaults,
    getFunnelSelectedField,
    resolveFunnelFieldId,
    type FunnelSeriesDataPoint,
} from '@lightdash/visualization/editor';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useEffect, useMemo } from 'react';
import {
    buildFunnelEditorState,
    funnelEditorActions,
    selectFunnelEditor,
    useEditorFieldSetter,
    useVisualizationDispatch,
    type FunnelEditorState,
    useVisualizationSelector,
} from '../features/visualization/store';
import { type InfiniteQueryResults } from './useQueryResults';

type FunnelChartConfig = {
    validConfig: FunnelChart;

    fieldId: string | null;
    maxValue: number;
    selectedField: Metric | TableCalculation | undefined;
    onFieldChange: (fieldId: string | null) => void;

    dataInput: FunnelChartDataInput;
    setDataInput: (dataInput: FunnelChartDataInput) => void;

    labels: FunnelChart['labels'];
    onLabelsChange: (newLabel: FunnelChart['labels']) => void;

    labelOverrides: Record<string, string>;
    onLabelOverridesChange: (key: string, value: string) => void;

    colorDefaults: Record<string, string>;

    colorOverrides: Record<string, string>;
    onColorOverridesChange: (key: string, value: string) => void;

    showLegend: boolean;
    toggleShowLegend: () => void;
    legendPosition: FunnelChartLegendPosition;
    legendPositionChange: (position: FunnelChartLegendPosition) => void;

    data: FunnelSeriesDataPoint[];
};

export type FunnelChartConfigFn = (
    resultsData: InfiniteQueryResults | undefined,
    funnelChartConfig: FunnelChart | undefined,
    itemsMap: ItemsMap | undefined,
    numericFields: Record<string, Metric | TableCalculation>,
    colorPalette: string[],
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => FunnelChartConfig;

/**
 * The explorer's editable funnel config. Every derivation (the selected
 * field, the steps and max value, the default colors, the valid config)
 * runs through `@lightdash/visualization`; the editor state lives in the
 * visualization store and this hook exposes its mutators.
 */
const useFunnelChartConfig: FunnelChartConfigFn = (
    resultsData,
    funnelChartConfig,
    itemsMap,
    numericFields,
    colorPalette,
    tableCalculationsMetadata,
) => {
    const {
        fieldId,
        dataInput,
        labels,
        labelOverrides,
        colorOverrides,
        showLegend,
        legendPosition,
    } = useVisualizationSelector(selectFunnelEditor);
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<FunnelEditorState>(
        selectFunnelEditor,
        funnelEditorActions.set,
    );

    const [debouncedLabelOverrides] = useDebouncedValue(labelOverrides, 500);

    const allNumericFieldIds = useMemo(
        () => (numericFields ? Object.keys(numericFields) : []),
        [numericFields],
    );

    const selectedField = useMemo(
        () => getFunnelSelectedField(itemsMap, fieldId),
        [itemsMap, fieldId],
    );

    const isLoading = !resultsData;

    useEffect(() => {
        if (isLoading) return;

        const nextFieldId = resolveFunnelFieldId({
            fieldId,
            allNumericFieldIds,
            tableCalculationsMetadata,
        });
        if (nextFieldId !== fieldId) set('fieldId', nextFieldId);
    }, [
        allNumericFieldIds,
        fieldId,
        isLoading,
        tableCalculationsMetadata,
        set,
    ]);

    // Max value is the largest step value, used to calculate the percentage
    // each step represents
    const { data, maxValue = 0 } = useMemo(
        () =>
            getFunnelChartData({
                resultsData,
                fieldId,
                selectedField,
                dataInput,
                allNumericFieldIds,
                itemsMap,
            }),
        [
            allNumericFieldIds,
            dataInput,
            fieldId,
            resultsData,
            selectedField,
            itemsMap,
        ],
    );

    const colorDefaults = useMemo(
        () => getFunnelColorDefaults(data, colorPalette),
        [data, colorPalette],
    );

    const setFieldId = useCallback(
        (value: string | null) => set('fieldId', value),
        [set],
    );

    const setDataInput = useCallback(
        (value: FunnelChartDataInput) => set('dataInput', value),
        [set],
    );

    const onLabelsChange = useCallback(
        (labelsProps: FunnelChart['labels']) =>
            dispatch(funnelEditorActions.labelsMerge(labelsProps)),
        [dispatch],
    );

    const onLabelOverridesChange = useCallback(
        (key: string, value: string) =>
            dispatch(funnelEditorActions.labelOverrideChange({ key, value })),
        [dispatch],
    );

    const onColorOverridesChange = useCallback(
        (key: string, value: string) =>
            dispatch(funnelEditorActions.colorOverrideChange({ key, value })),
        [dispatch],
    );

    const handleLegendPositionChange = useCallback(
        (position: FunnelChartLegendPosition) =>
            set('legendPosition', position),
        [set],
    );

    const toggleShowLegend = useCallback(
        () => dispatch(funnelEditorActions.toggleShowLegend()),
        [dispatch],
    );

    const validConfig: FunnelChart = useMemo(
        () =>
            buildValidFunnelConfig({
                dataInput,
                fieldId,
                labels,
                labelOverrides: debouncedLabelOverrides,
                colorOverrides,
                showLegend,
                legendPosition,
            }),
        [
            colorOverrides,
            dataInput,
            debouncedLabelOverrides,
            fieldId,
            labels,
            legendPosition,
            showLegend,
        ],
    );

    return useMemo(
        () => ({
            validConfig,
            selectedField,
            fieldId,
            maxValue,
            onFieldChange: setFieldId,
            dataInput,
            setDataInput,
            labels,
            onLabelsChange,
            labelOverrides,
            onLabelOverridesChange,
            colorDefaults,
            colorOverrides,
            onColorOverridesChange,
            showLegend,
            toggleShowLegend,
            legendPosition,
            legendPositionChange: handleLegendPositionChange,

            colorPalette,
            data,
        }),
        [
            validConfig,
            selectedField,
            fieldId,
            maxValue,
            setFieldId,
            dataInput,
            setDataInput,
            labels,
            onLabelsChange,
            labelOverrides,
            onLabelOverridesChange,
            colorDefaults,
            colorOverrides,
            onColorOverridesChange,
            showLegend,
            toggleShowLegend,
            legendPosition,
            handleLegendPositionChange,
            colorPalette,
            data,
        ],
    );
};

export default useFunnelChartConfig;
