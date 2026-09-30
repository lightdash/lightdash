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
    DEFAULT_FUNNEL_DATA_INPUT,
    DEFAULT_FUNNEL_LABELS,
    DEFAULT_FUNNEL_LEGEND_POSITION,
    DEFAULT_FUNNEL_SHOW_LEGEND,
    getFunnelChartData,
    getFunnelColorDefaults,
    getFunnelSelectedField,
    resolveFunnelFieldId,
    type FunnelSeriesDataPoint,
} from '@lightdash/visualization';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
 * runs through `@lightdash/visualization`; this hook only holds the editor
 * state and its mutators.
 */
const useFunnelChartConfig: FunnelChartConfigFn = (
    resultsData,
    funnelChartConfig,
    itemsMap,
    numericFields,
    colorPalette,
    tableCalculationsMetadata,
) => {
    const [fieldId, setFieldId] = useState(funnelChartConfig?.fieldId ?? null);

    const [dataInput, setDataInput] = useState(
        funnelChartConfig?.dataInput ?? DEFAULT_FUNNEL_DATA_INPUT,
    );

    const [labels, setLabels] = useState<FunnelChart['labels']>(
        funnelChartConfig?.labels ?? DEFAULT_FUNNEL_LABELS,
    );

    const [labelOverrides, setLabelOverrides] = useState(
        funnelChartConfig?.labelOverrides ?? {},
    );

    const [debouncedLabelOverrides] = useDebouncedValue(labelOverrides, 500);

    const [colorOverrides, setColorOverrides] = useState(
        funnelChartConfig?.colorOverrides ?? {},
    );

    const [showLegend, setShowLegend] = useState(
        funnelChartConfig?.showLegend ?? DEFAULT_FUNNEL_SHOW_LEGEND,
    );

    const [legendPosition, setLegendPosition] = useState(
        funnelChartConfig?.legendPosition ?? DEFAULT_FUNNEL_LEGEND_POSITION,
    );

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
        if (nextFieldId !== fieldId) setFieldId(nextFieldId);
    }, [allNumericFieldIds, fieldId, isLoading, tableCalculationsMetadata]);

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

    const onLabelsChange = (labelsProps: FunnelChart['labels']) => {
        setLabels((prevLabels) => ({ ...prevLabels, ...labelsProps }));
    };

    const onLabelOverridesChange = useCallback((key: string, value: string) => {
        setLabelOverrides(({ [key]: _, ...rest }) => {
            return value.trim() === '' ? rest : { ...rest, [key]: value };
        });
    }, []);

    const onColorOverridesChange = useCallback((key: string, value: string) => {
        setColorOverrides(({ [key]: _, ...rest }) => {
            return value.trim() === '' ? rest : { ...rest, [key]: value };
        });
    }, []);

    const handleLegendPositionChange = useCallback(
        (position: FunnelChartLegendPosition) => {
            setLegendPosition(position);
        },
        [],
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

    return {
        validConfig,
        selectedField,
        fieldId,
        maxValue: maxValue,
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
        toggleShowLegend: () => setShowLegend((prev) => !prev),
        legendPosition: legendPosition,
        legendPositionChange: handleLegendPositionChange,

        colorPalette,
        data,
    };
};

export default useFunnelChartConfig;
