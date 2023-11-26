import {
    ApiQueryResults,
    CustomDimension,
    ECHARTS_DEFAULT_COLORS,
    Explore,
    Field,
    fieldId,
    formatItemValue,
    getCustomDimensionId,
    isCustomDimension,
    isField,
    PieChart,
    PieChartLegendPosition,
    PieChartLegendPositionDefault,
    PieChartValueOptions,
    ResultRow,
    ResultValue,
    TableCalculation,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import isEmpty from 'lodash-es/isEmpty';
import isEqual from 'lodash-es/isEqual';
import mapValues from 'lodash-es/mapValues';
import omitBy from 'lodash-es/omitBy';
import pick from 'lodash-es/pick';
import pickBy from 'lodash-es/pickBy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isHexCodeColor } from '../utils/colorUtils';
import { useOrganization } from './organization/useOrganization';

type PieChartConfig = {
    validConfig: PieChart;

    groupFieldIds: (string | null)[];
    groupAdd: () => void;
    groupChange: (prevDimensionId: string, newDimensionId: string) => void;
    groupRemove: (dimensionId: string) => void;

    metricId: string | null;
    selectedMetric: Field | TableCalculation | undefined;
    metricChange: (metricId: string | null) => void;

    isDonut: boolean;
    toggleDonut: () => void;

    valueLabel: PieChartValueOptions['valueLabel'];
    valueLabelChange: (valueLabel: PieChartValueOptions['valueLabel']) => void;
    showValue: PieChartValueOptions['showValue'];
    toggleShowValue: () => void;
    showPercentage: PieChartValueOptions['showPercentage'];
    toggleShowPercentage: () => void;

    isValueLabelOverriden: boolean;
    isShowValueOverriden: boolean;
    isShowPercentageOverriden: boolean;

    defaultColors: string[];

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

    data: {
        name: string;
        value: number;
        meta: {
            value: ResultValue;
            rows: ResultRow[];
        };
    }[];
};

type PieChartConfigFn = (
    explore: Explore | undefined,
    resultsData: ApiQueryResults | undefined,
    pieChartConfig: PieChart | undefined,
    dimensions: Field[],
    allNumericMetrics: (Field | TableCalculation)[],
    customDimensions: CustomDimension[],
) => PieChartConfig;

const usePieChartConfig: PieChartConfigFn = (
    explore,
    resultsData,
    pieChartConfig,
    dimensions,
    allNumericMetrics,
    customDimensions,
) => {
    const { data: org } = useOrganization();

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
        pieChartConfig?.showPercentage ?? true,
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

    const [groupSortOverrides, setGroupSortOverrides] = useState(
        pieChartConfig?.groupSortOverrides ?? [],
    );

    const [showLegend, setShowLegend] = useState(
        pieChartConfig?.showLegend ?? true,
    );

    const [legendPosition, setLegendPosition] = useState(
        pieChartConfig?.legendPosition ?? PieChartLegendPositionDefault,
    );

    const defaultColors = useMemo(
        () => org?.chartColors ?? ECHARTS_DEFAULT_COLORS,
        [org],
    );

    const dimensionIds = useMemo(
        () =>
            [...dimensions, ...customDimensions].map((dimension) => {
                if (isCustomDimension(dimension))
                    return getCustomDimensionId(dimension);
                return fieldId(dimension);
            }),
        [customDimensions, dimensions],
    );

    const allNumericMetricIds = useMemo(
        () => allNumericMetrics.map((m) => (isField(m) ? fieldId(m) : m.name)),
        [allNumericMetrics],
    );

    const selectedMetric = useMemo(() => {
        return allNumericMetrics.find((m) =>
            isField(m) ? fieldId(m) === metricId : m.name === metricId,
        );
    }, [allNumericMetrics, metricId]);

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

    const isValueLabelOverriden = useMemo(() => {
        return Object.values(groupValueOptionOverrides).some(
            (value) => value.valueLabel !== undefined,
        );
    }, [groupValueOptionOverrides]);

    const isShowValueOverriden = useMemo(() => {
        return Object.values(groupValueOptionOverrides).some(
            (value) => value.showValue !== undefined,
        );
    }, [groupValueOptionOverrides]);

    const isShowPercentageOverriden = useMemo(() => {
        return Object.values(groupValueOptionOverrides).some(
            (value) => value.showPercentage !== undefined,
        );
    }, [groupValueOptionOverrides]);

    const data = useMemo(() => {
        if (
            !metricId ||
            !selectedMetric ||
            !resultsData ||
            resultsData.rows.length === 0 ||
            !groupFieldIds ||
            groupFieldIds.length === 0
        ) {
            return [];
        }

        const mappedData = resultsData.rows.map((row) => {
            const name = groupFieldIds
                .map((groupFieldId) => row[groupFieldId]?.value?.formatted)
                .filter(Boolean)
                .join(' - ');

            const value = Number(row[metricId].value.raw);

            return { name, value, row };
        });

        return Object.entries(
            mappedData.reduce<
                Record<
                    string,
                    {
                        value: number;
                        rows: ResultRow[];
                    }
                >
            >((acc, { name, value, row }) => {
                return {
                    ...acc,
                    [name]: {
                        value: (acc[name]?.value ?? 0) + value,
                        rows: [...(acc[name]?.rows ?? []), row],
                    },
                };
            }, {}),
        )
            .map(([name, { value, rows }]) => ({
                name,
                value,
                meta: {
                    value: {
                        formatted: formatItemValue(selectedMetric, value),
                        raw: value,
                    },
                    rows,
                },
            }))
            .sort((a, b) => b.value - a.value);
    }, [resultsData, groupFieldIds, selectedMetric, metricId]);

    const groupLabels = useMemo(() => {
        return data.map(({ name }) => name);
    }, [data]);

    const sortedGroupLabels = useMemo(() => {
        const availableSortedOverrides = groupSortOverrides.filter((label) =>
            groupLabels.includes(label),
        );

        return availableSortedOverrides.length > 0
            ? availableSortedOverrides
            : groupLabels;
    }, [groupSortOverrides, groupLabels]);

    const groupColorDefaults = useMemo(() => {
        return Object.fromEntries(
            groupLabels.map((name, index) => [
                name,
                defaultColors[index % defaultColors.length],
            ]),
        );
    }, [groupLabels, defaultColors]);

    const handleGroupChange = useCallback(
        (prevDimensionId: string, newDimensionId: string) => {
            setGroupFieldIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(prevDimensionId);
                newSet.add(newDimensionId);
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

    const handleValueLabelChange = useCallback(
        (newValueLabel: PieChartValueOptions['valueLabel']) => {
            setValueLabel(newValueLabel);

            setGroupValueOptionOverrides((prev) =>
                mapValues(prev, ({ valueLabel: _, ...rest }) => ({ ...rest })),
            );
        },
        [],
    );

    const handleToggleShowValue = useCallback(() => {
        setShowValue((prev) => !prev);

        setGroupValueOptionOverrides((prev) =>
            mapValues(prev, ({ showValue: _, ...rest }) => ({ ...rest })),
        );
    }, []);

    const handleToggleShowPercentage = useCallback(() => {
        setShowPercentage((prev) => !prev);

        setGroupValueOptionOverrides((prev) =>
            mapValues(prev, ({ showPercentage: _, ...rest }) => ({ ...rest })),
        );
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

    const handleGroupSortChange = useCallback(
        (oldIndex: number, newIndex: number) => {
            setGroupSortOverrides((overrides) => {
                const filteredOverrides = overrides.filter((label) =>
                    groupLabels.includes(label),
                );

                const newSort = [
                    ...(filteredOverrides.length > 0
                        ? filteredOverrides
                        : groupLabels),
                ];
                const [removed] = newSort.splice(oldIndex, 1);
                newSort.splice(newIndex, 0, removed);

                return newSort;
            });
        },
        [groupLabels],
    );

    const handleLegendPositionChange = useCallback(
        (position: PieChartLegendPosition) => {
            setLegendPosition(position);
        },
        [],
    );

    const validConfig: PieChart = useMemo(
        () => ({
            groupFieldIds,
            metricId: metricId ?? undefined,
            isDonut,
            valueLabel,
            showValue,
            showPercentage,
            groupLabelOverrides: pick(
                debouncedGroupLabelOverrides,
                groupLabels,
            ),
            groupColorOverrides: pickBy(
                pick(debouncedGroupColorOverrides, groupLabels),
                isHexCodeColor,
            ),
            groupValueOptionOverrides: omitBy(
                pick(groupValueOptionOverrides, groupLabels),
                isEmpty,
            ),
            groupSortOverrides: groupSortOverrides.filter((label) =>
                groupLabels.includes(label),
            ),
            showLegend,
            legendPosition,
        }),
        [
            groupFieldIds,
            metricId,
            isDonut,
            valueLabel,
            showValue,
            showPercentage,
            groupLabels,
            debouncedGroupLabelOverrides,
            debouncedGroupColorOverrides,
            groupValueOptionOverrides,
            groupSortOverrides,
            showLegend,
            legendPosition,
        ],
    );

    return {
        validConfig,

        groupFieldIds: Array.from(groupFieldIds),
        groupAdd: handleGroupAdd,
        groupChange: handleGroupChange,
        groupRemove: handleRemoveGroup,

        selectedMetric,
        metricId,
        metricChange: setMetricId,

        isDonut,
        toggleDonut: () => setIsDonut((prev) => !prev),

        valueLabel,
        valueLabelChange: handleValueLabelChange,
        showValue,
        toggleShowValue: handleToggleShowValue,
        showPercentage,
        toggleShowPercentage: handleToggleShowPercentage,

        isValueLabelOverriden,
        isShowValueOverriden,
        isShowPercentageOverriden,

        defaultColors,

        sortedGroupLabels,
        groupLabelOverrides,
        groupLabelChange: handleGroupLabelChange,
        groupColorOverrides,
        groupColorDefaults,
        groupColorChange: handleGroupColorChange,
        groupValueOptionOverrides,
        groupValueOptionChange: handleGroupValueOptionChange,
        groupSortOverrides,
        groupSortChange: handleGroupSortChange,

        showLegend,
        toggleShowLegend: () => setShowLegend((prev) => !prev),
        legendPosition,
        legendPositionChange: handleLegendPositionChange,

        data,
    };
};

export default usePieChartConfig;
