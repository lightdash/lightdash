import {
    AdditionalMetric,
    ApiQueryResults,
    ECHARTS_DEFAULT_COLORS,
    Explore,
    Field,
    fieldId,
    isAdditionalMetric,
    isField,
    isMetric,
    Metric,
    PieChart,
    PieChartValueOptions,
    TableCalculation,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import isEqual from 'lodash-es/isEqual';
import mapValues from 'lodash-es/mapValues';
import pick from 'lodash-es/pick';
import uniq from 'lodash-es/uniq';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isHexCodeColor } from '../utils/colorUtils';
import { useOrganization } from './organization/useOrganization';

type PieChartConfig = {
    validPieChartConfig: PieChart;

    groupFieldIds: (string | null)[];
    groupAdd: () => void;
    groupChange: (prevValue: any, newValue: any) => void;
    groupRemove: (dimensionId: any) => void;

    metricId: string | null;
    metricChange: (metricId: string | null) => void;

    isDonut: boolean;
    toggleDonut: () => void;

    valueLabel: PieChartValueOptions['valueLabel'];
    valueLabelChange: (valueLabel: PieChartValueOptions['valueLabel']) => void;

    showValue: PieChartValueOptions['showValue'];
    toggleShowValue: () => void;
    showPercentage: PieChartValueOptions['showPercentage'];
    toggleShowPercentage: () => void;

    defaultColors: string[];

    groupLabels: string[];
    groupLabelOverrides: Record<string, string>;
    groupLabelChange: (prevValue: any, newValue: any) => void;
    groupColorOverrides: Record<string, string>;
    groupColorDefaults: Record<string, string>;
    groupColorChange: (prevValue: any, newValue: any) => void;
    groupValueOptionOverrides: Record<string, PieChartValueOptions>;
    groupValueOptionChange: (
        label: string,
        value: Partial<PieChartValueOptions>,
    ) => void;

    showLegend: boolean;
    toggleShowLegend: () => void;
};

type PieChartConfigFn = (
    explore: Explore | undefined,
    resultsData: ApiQueryResults | undefined,
    pieChartConfig: PieChart | undefined,
    dimensions: Field[],
    allNumericMetrics: (Metric | AdditionalMetric | TableCalculation)[],
) => PieChartConfig;

const usePieChartConfig: PieChartConfigFn = (
    explore,
    resultsData,
    pieChartConfig,
    dimensions,
    allNumericMetrics,
) => {
    const { data } = useOrganization();

    const [groupFieldIds, setGroupFieldIds] = useState(
        pieChartConfig?.groupFieldIds ?? [],
    );

    const [metricId, setMetricId] = useState(pieChartConfig?.metricId ?? null);

    const [isDonut, setIsDonut] = useState(pieChartConfig?.isDonut ?? true);

    const [valueLabel, setValueLabel] = useState(
        pieChartConfig?.valueLabel ?? 'hidden',
    );

    const [showValue, setShowValue] = useState(
        pieChartConfig?.showValue ?? false,
    );

    const [showPercentage, setShowPercentage] = useState(
        pieChartConfig?.showPercentage ?? false,
    );

    const [groupLabelOverrides, setGroupLabelOverrides] = useState(
        pieChartConfig?.groupLabelOverrides ?? {},
    );

    const [debouncedGroupLabelOverrides] = useDebouncedValue(
        groupLabelOverrides,
        500,
    );

    const [groupColorOverrides, setGroupColorOverrides] = useState(
        pieChartConfig?.groupColorOverrides ?? {},
    );

    const [debouncedGroupColorOverrides] = useDebouncedValue(
        groupColorOverrides,
        500,
    );

    const [groupValueOptionOverrides, setGroupValueOptionOverrides] = useState(
        pieChartConfig?.groupValueOptionOverrides ?? {},
    );

    const [showLegend, setShowLegend] = useState(
        pieChartConfig?.showLegend ?? true,
    );

    const defaultColors = useMemo(
        () => data?.chartColors ?? ECHARTS_DEFAULT_COLORS,
        [data],
    );

    const dimensionIds = useMemo(() => dimensions.map(fieldId), [dimensions]);

    const allNumericMetricIds = useMemo(
        () =>
            allNumericMetrics.map((m) =>
                (isField(m) && isMetric(m)) || isAdditionalMetric(m)
                    ? fieldId(m)
                    : m.name,
            ),
        [allNumericMetrics],
    );

    const isLoading = !explore || !resultsData;

    useEffect(() => {
        if (isLoading) return;

        const newGroupFieldIds = groupFieldIds.filter((id) =>
            dimensionIds.includes(id),
        );

        const firstDimensionId = dimensionIds[0];
        if (newGroupFieldIds.length === 0 && firstDimensionId) {
            setGroupFieldIds([firstDimensionId]);
            return;
        }

        if (isEqual(newGroupFieldIds, groupFieldIds)) return;

        setGroupFieldIds(newGroupFieldIds);
    }, [isLoading, dimensionIds, groupFieldIds, pieChartConfig?.groupFieldIds]);

    useEffect(() => {
        if (isLoading) return;
        if (metricId && allNumericMetricIds.includes(metricId)) return;

        setMetricId(allNumericMetricIds[0] ?? null);
    }, [isLoading, allNumericMetricIds, metricId, pieChartConfig?.metricId]);

    const handleGroupChange = useCallback(
        (prevValue: string, newValue: string) => {
            setGroupFieldIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(prevValue);
                newSet.add(newValue);
                return [...newSet.values()];
            });
        },
        [],
    );

    const handleGroupAdd = useCallback(() => {
        setGroupFieldIds((prev) => {
            const nextId = dimensionIds.find((id) => !prev.includes(id));
            if (!nextId) return prev;

            const newSet = new Set(prev);
            newSet.add(nextId);
            return [...newSet.values()];
        });
    }, [dimensionIds]);

    const handleRemoveGroup = useCallback((dimensionId: string) => {
        setGroupFieldIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(dimensionId);
            return [...newSet.values()];
        });
    }, []);

    const handleGroupLabelChange = useCallback((key: string, value: string) => {
        setGroupLabelOverrides(({ [key]: _, ...rest }) => {
            return value === '' ? rest : { ...rest, [key]: value };
        });
    }, []);

    const handleGroupColorChange = useCallback((key: string, value: string) => {
        setGroupColorOverrides(({ [key]: _, ...rest }) => {
            return value === '' ? rest : { ...rest, [key]: value };
        });
    }, []);

    const handleGroupValueOptionChange = useCallback(
        (label: string, value: Partial<PieChartValueOptions>) => {
            setGroupValueOptionOverrides((prev) => {
                return { ...prev, [label]: { ...prev[label], ...value } };
            });
        },
        [],
    );

    const groupLabels = useMemo(() => {
        if (
            !resultsData ||
            !explore ||
            !groupFieldIds ||
            groupFieldIds.length === 0
        ) {
            return [];
        }

        return uniq(
            resultsData.rows.map((row) => {
                return groupFieldIds
                    .map((id) => row[id]?.value?.formatted)
                    .join(' - ');
            }),
        );
    }, [resultsData, explore, groupFieldIds]);

    const groupColorDefaults = useMemo(() => {
        return Object.fromEntries(
            groupLabels.map((name, index) => [
                name,
                defaultColors[index % defaultColors.length],
            ]),
        );
    }, [groupLabels, defaultColors]);

    const validPieChartConfig: PieChart = useMemo(
        () => ({
            isDonut,
            groupFieldIds,
            metricId: metricId ?? undefined,
            valueLabel,
            showValue,
            showPercentage,
            groupLabelOverrides: pick(
                debouncedGroupLabelOverrides,
                groupLabels,
            ),
            groupColorOverrides: mapValues(
                pick(debouncedGroupColorOverrides, groupLabels),
                (color, label) =>
                    isHexCodeColor(color) ? color : groupColorDefaults[label],
            ),
            showLegend,
        }),
        [
            isDonut,
            groupFieldIds,
            metricId,
            valueLabel,
            showValue,
            showPercentage,
            groupLabels,
            debouncedGroupLabelOverrides,
            groupColorDefaults,
            debouncedGroupColorOverrides,
            showLegend,
        ],
    );

    const values: PieChartConfig = useMemo(
        () => ({
            validPieChartConfig,

            groupFieldIds: Array.from(groupFieldIds),
            groupAdd: handleGroupAdd,
            groupChange: handleGroupChange,
            groupRemove: handleRemoveGroup,

            metricId,
            metricChange: setMetricId,

            isDonut,
            toggleDonut: () => setIsDonut((prev) => !prev),

            valueLabel,
            valueLabelChange: setValueLabel,
            showValue,
            toggleShowValue: () => setShowValue((prev) => !prev),
            showPercentage,
            toggleShowPercentage: () => setShowPercentage((prev) => !prev),

            defaultColors,

            groupLabels,
            groupLabelOverrides,
            groupLabelChange: handleGroupLabelChange,
            groupColorOverrides,
            groupColorDefaults,
            groupColorChange: handleGroupColorChange,
            groupValueOptionOverrides,
            groupValueOptionChange: handleGroupValueOptionChange,

            showLegend,
            toggleShowLegend: () => setShowLegend((prev) => !prev),
        }),
        [
            validPieChartConfig,

            groupFieldIds,
            handleGroupAdd,
            handleGroupChange,
            handleRemoveGroup,

            metricId,

            isDonut,

            valueLabel,
            setValueLabel,
            showValue,
            showPercentage,

            defaultColors,

            groupLabels,
            groupLabelOverrides,
            handleGroupLabelChange,
            groupColorOverrides,
            groupColorDefaults,
            handleGroupColorChange,
            groupValueOptionOverrides,
            handleGroupValueOptionChange,

            showLegend,
        ],
    );

    return values;
};

export default usePieChartConfig;
