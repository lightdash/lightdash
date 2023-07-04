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
    PieChartValueLabel,
    TableCalculation,
} from '@lightdash/common';
import isEqual from 'lodash-es/isEqual';
import pick from 'lodash-es/pick';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

    valueLabel: PieChartValueLabel;
    valueLabelChange: (valueLabel: PieChartValueLabel) => void;

    defaultColors: string[];

    groupLabels: string[];
    groupLabelOverrides: Record<string, string>;
    groupLabelChange: (prevValue: any, newValue: any) => void;
    groupColorOverrides: Record<string, string>;
    groupColorDefaults: Record<string, string>;
    groupColorChange: (prevValue: any, newValue: any) => void;

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

    const [groupFieldIds, setGroupFieldIds] = useState<Array<string | null>>(
        pieChartConfig?.groupFieldIds ?? [],
    );

    const [metricId, setMetricId] = useState(pieChartConfig?.metricId ?? null);

    const [groupLabelOverrides, setGroupLabelOverrides] = useState(
        pieChartConfig?.groupLabelOverrides ?? {},
    );

    const [groupColorOverrides, setGroupColorOverrides] = useState(
        pieChartConfig?.groupColorOverrides ?? {},
    );

    const isLoading = !explore || !resultsData;

    useEffect(() => {
        if (isLoading) return;

        const newGroupFieldIds = groupFieldIds.filter(
            (id) => id === null || dimensionIds.includes(id),
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

    const handleGroupChange = useCallback((prevValue, newValue) => {
        setGroupFieldIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(prevValue);
            newSet.add(newValue);
            return [...newSet.values()];
        });
    }, []);

    const handleGroupAdd = useCallback(() => {
        setGroupFieldIds((prev) => {
            const nextId = dimensionIds.find((id) => !prev.includes(id));

            const newSet = new Set(prev);
            newSet.add(nextId ?? null);
            return [...newSet.values()];
        });
    }, [dimensionIds]);

    const handleRemoveGroup = useCallback((dimensionId) => {
        setGroupFieldIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(dimensionId);
            return [...newSet.values()];
        });
    }, []);

    const handleGroupLabelChange = useCallback((key, value) => {
        setGroupLabelOverrides((prev) => {
            return { ...prev, [key]: value === '' ? undefined : value };
        });
    }, []);

    const handleGroupColorChange = useCallback((key, value) => {
        setGroupColorOverrides((prev) => {
            return { ...prev, [key]: value === '' ? undefined : value };
        });
    }, []);

    const [isDonut, setIsDonut] = useState<boolean>(
        pieChartConfig?.isDonut ?? false,
    );

    const [valueLabel, setValueLabel] = useState<PieChartValueLabel>(
        pieChartConfig?.valueLabel ?? 'hidden',
    );

    const [showLegend, setShowLegend] = useState<boolean>(
        pieChartConfig?.showLegend ?? false,
    );

    const groupLabels = useMemo(() => {
        const fieldIds = groupFieldIds.filter(
            (id): id is string => id !== null,
        );
        if (!resultsData || !explore || !fieldIds || fieldIds.length === 0) {
            return [];
        }

        return resultsData.rows.map((row) =>
            fieldIds.map((id) => row[id].value.formatted).join(' - '),
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
            groupFieldIds: Array.from(groupFieldIds).filter(
                (id): id is string => id !== null,
            ),
            metricId: metricId ?? undefined,
            valueLabel,
            showLegend,
            groupLabelOverrides: pick(groupLabelOverrides, groupLabels),
            groupColorOverrides: pick(groupColorOverrides, groupLabels),
        }),
        [
            isDonut,
            groupFieldIds,
            metricId,
            valueLabel,
            showLegend,
            groupLabels,
            groupLabelOverrides,
            groupColorOverrides,
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

            defaultColors,

            groupLabels,
            groupLabelOverrides,
            groupLabelChange: handleGroupLabelChange,
            groupColorOverrides,
            groupColorDefaults,
            groupColorChange: handleGroupColorChange,

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

            defaultColors,

            groupLabels,
            groupLabelOverrides,
            handleGroupLabelChange,
            groupColorOverrides,
            groupColorDefaults,
            handleGroupColorChange,

            showLegend,
        ],
    );

    return values;
};

export default usePieChartConfig;
