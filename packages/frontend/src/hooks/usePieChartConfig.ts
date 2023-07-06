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

    const [metricId, setMetricId] = useState(pieChartConfig?.metricId ?? null);

    const [isDonut, setIsDonut] = useState<boolean>(
        pieChartConfig?.isDonut ?? true,
    );

    const [valueLabel, setValueLabel] = useState<PieChartValueLabel>(
        pieChartConfig?.valueLabel ?? 'hidden',
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

    const [showLegend, setShowLegend] = useState<boolean>(
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

    const [groupFieldIds, setGroupFieldIds] = useState<string[]>(
        pieChartConfig?.groupFieldIds ?? [],
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
            if (!nextId) return prev;

            const newSet = new Set(prev);
            newSet.add(nextId);
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
            showLegend,
            groupLabelOverrides: pick(
                debouncedGroupLabelOverrides,
                groupLabels,
            ),
            groupColorOverrides: mapValues(
                pick(debouncedGroupColorOverrides, groupLabels),
                (color, label) =>
                    isHexCodeColor(color) ? color : groupColorDefaults[label],
            ),
        }),
        [
            isDonut,
            groupFieldIds,
            metricId,
            valueLabel,
            showLegend,
            groupLabels,
            debouncedGroupLabelOverrides,
            groupColorDefaults,
            debouncedGroupColorOverrides,
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
