import {
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    isField,
    isMetric,
    isTableCalculation,
    type ApiQueryResults,
    type FunnelChart,
    type ItemsMap,
    type Metric,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type FunnelSeriesDataPoint } from './echarts/useEchartsFunnelConfig';

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
    resultsData: ApiQueryResults | undefined,
    funnelChartConfig: FunnelChart | undefined,
    itemsMap: ItemsMap | undefined,
    numericFields: Record<string, Metric | TableCalculation>,
    colorPalette: string[],
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => FunnelChartConfig;

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
        funnelChartConfig?.dataInput ?? FunnelChartDataInput.ROW,
    );

    const [labels, setLabels] = useState<FunnelChart['labels']>(
        funnelChartConfig?.labels ?? {
            position: FunnelChartLabelPosition.INSIDE,
            showValue: true,
            showPercentage: false,
        },
    );

    const [labelOverrides, setLabelOverrides] = useState(
        funnelChartConfig?.labelOverrides ?? {},
    );

    const [debouncedLabelOverrides] = useDebouncedValue(labelOverrides, 500);

    const [colorOverrides, setColorOverrides] = useState(
        funnelChartConfig?.colorOverrides ?? {},
    );

    const [showLegend, setShowLegend] = useState(
        funnelChartConfig?.showLegend ?? true,
    );

    const [legendPosition, setLegendPosition] = useState(
        funnelChartConfig?.legendPosition ??
            FunnelChartLegendPosition.HORIZONTAL,
    );

    const allNumericFieldIds = useMemo(
        () => Object.keys(numericFields),
        [numericFields],
    );

    const selectedField = useMemo(() => {
        if (!itemsMap || !fieldId || !(fieldId in itemsMap)) return undefined;
        const item = itemsMap[fieldId];

        if ((isField(item) && isMetric(item)) || isTableCalculation(item))
            return item;

        return undefined;
    }, [itemsMap, fieldId]);

    const isLoading = !resultsData;

    useEffect(() => {
        if (isLoading || allNumericFieldIds.length === 0) return;
        if (fieldId && allNumericFieldIds.includes(fieldId)) return;

        /**
         * When table calculations update, their name changes, so we need to update the selected fields
         * If the selected field is a table calculation with the old name in the metadata, set it to the new name
         */
        if (tableCalculationsMetadata) {
            const metricTcIndex = tableCalculationsMetadata.findIndex(
                (tc) => tc.oldName === fieldId,
            );

            if (metricTcIndex !== -1) {
                setFieldId(tableCalculationsMetadata[metricTcIndex].name);
                return;
            }
        }

        setFieldId(allNumericFieldIds[0] ?? null);
    }, [allNumericFieldIds, fieldId, isLoading, tableCalculationsMetadata]);

    // Max value is the value at the top of the funnel. This is used to calculate
    // the percentage of the funnel that each step represents
    const {
        data,
        maxValue = 0,
    }: {
        data: FunnelSeriesDataPoint[];
        maxValue: number;
    } = useMemo(() => {
        if (
            !resultsData ||
            !fieldId ||
            !selectedField ||
            resultsData.rows.length === 0
        ) {
            return { data: [], maxValue: 0 };
        }

        let dataMaxValue = 0;

        if (dataInput === FunnelChartDataInput.COLUMN) {
            const fieldIndex = Object.keys(resultsData.rows[0]).findIndex(
                (field) => {
                    return field === fieldId;
                },
            );

            if (fieldIndex === -1) {
                return { data: [], maxValue: 0 };
            }

            return {
                data: resultsData.rows.map<FunnelSeriesDataPoint>((row) => {
                    const rowValues = Object.values(row).map(
                        (col) => col.value,
                    );

                    const dataValue = Number(rowValues[fieldIndex].raw);
                    if (dataValue > dataMaxValue) {
                        dataMaxValue = dataValue;
                    }
                    return {
                        name: rowValues[0].formatted,
                        value: dataValue,
                        meta: {
                            value: rowValues[fieldIndex],
                            rows: [row],
                        },
                    };
                }),
                maxValue: dataMaxValue,
            };
        } else {
            return {
                data: allNumericFieldIds.reduce<FunnelSeriesDataPoint[]>(
                    (acc, id) => {
                        if (resultsData.rows[0][id]) {
                            const dataValue = Number(
                                resultsData.rows[0][id].value.raw,
                            );
                            if (dataValue > dataMaxValue) {
                                dataMaxValue = dataValue;
                            }
                            acc.push({
                                name: id,
                                value: dataValue,
                                meta: {
                                    value: resultsData.rows[0][id].value,
                                    rows: resultsData.rows,
                                },
                            });
                        }
                        return acc;
                    },
                    [],
                ),
                maxValue: dataMaxValue,
            };
        }
    }, [allNumericFieldIds, dataInput, fieldId, resultsData, selectedField]);

    const colorDefaults = useMemo(() => {
        return Object.fromEntries(
            data.map((item, index) => {
                return [item.name, colorPalette[index % colorPalette.length]];
            }),
        );
    }, [data, colorPalette]);

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
        () => ({
            dataInput,
            fieldId: fieldId ?? undefined,
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
