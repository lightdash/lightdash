import {
    AdditionalMetric,
    ApiQueryResults,
    ChartConfig,
    ChartType,
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
import { useDebouncedValue, usePrevious } from '@mantine/hooks';
import isEmpty from 'lodash-es/isEmpty';
import mapValues from 'lodash-es/mapValues';
import omitBy from 'lodash-es/omitBy';
import pick from 'lodash-es/pick';
import pickBy from 'lodash-es/pickBy';
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
    selectedMetric: Metric | AdditionalMetric | TableCalculation | undefined;
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

    data: [string, number][];
};

type PieChartConfigArgs = {
    currentChartType: ChartType;
    currentChartConfig: ChartConfig | undefined;
    pieChartConfig: PieChart | undefined;
    pivotDimensions: string[] | undefined;
    explore: Explore | undefined;
    resultsData: ApiQueryResults | undefined;
    dimensions: Field[];
    allNumericMetrics: (Metric | AdditionalMetric | TableCalculation)[];
};

const usePieChartConfig = ({
    currentChartType,
    currentChartConfig,
    pieChartConfig,
    pivotDimensions,
    resultsData,
    explore,
    dimensions,
    allNumericMetrics,
}: PieChartConfigArgs): PieChartConfig => {
    const previousChartConfig = usePrevious(currentChartConfig);
    const previousPivotDimensions = usePrevious(pivotDimensions);

    console.log([previousPivotDimensions, previousChartConfig]);

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

    const defaultColors = useMemo(
        () => org?.chartColors ?? ECHARTS_DEFAULT_COLORS,
        [org],
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

    const selectedMetric = useMemo(() => {
        return allNumericMetrics.find((m) =>
            isField(m) ? fieldId(m) === metricId : m.name === metricId,
        );
    }, [allNumericMetrics, metricId]);

    const isLoading = !explore || !resultsData;

    useEffect(() => {
        if (isLoading) return;
        if (!currentChartConfig) return;
        if (groupFieldIds.length > 0 && metricId) return;
        if (currentChartType !== ChartType.PIE) return;

        console.log(currentChartType, currentChartConfig);

        switch (currentChartConfig.type) {
            case ChartType.PIE:
                return;
            case ChartType.CARTESIAN:
                const allItemIds = [
                    currentChartConfig.config.layout.xField,
                    ...(currentChartConfig.config.layout.yField ?? []),
                    ...(previousPivotDimensions ?? []),
                ].filter((id): id is string => !!id);

                console.log(currentChartConfig);

                const groupFieldIdsFromPreviousConfig = allItemIds.filter(
                    (id) => dimensionIds.includes(id),
                );

                const metricIdsFromPreviousConfig = allItemIds.filter((id) =>
                    allNumericMetricIds.includes(id),
                );

                setGroupFieldIds((prev) => {
                    if (
                        prev.length === 0 &&
                        groupFieldIdsFromPreviousConfig.length > 0
                    ) {
                        console.log('set dim', groupFieldIdsFromPreviousConfig);
                        return uniq(groupFieldIdsFromPreviousConfig);
                    } else {
                        return prev;
                    }
                });

                setMetricId((prev) => {
                    if (!prev && metricIdsFromPreviousConfig.length > 0) {
                        console.log('set met', metricIdsFromPreviousConfig);
                        return uniq(metricIdsFromPreviousConfig)[0];
                    } else {
                        return prev;
                    }
                });
        }
    }, [
        isLoading,
        currentChartType,
        currentChartConfig,
        previousPivotDimensions,
        allNumericMetricIds,
        dimensionIds,
        groupFieldIds,
        metricId,
    ]);

    useEffect(() => {
        if (isLoading) return;
        if (currentChartType !== ChartType.PIE) return;

        setGroupFieldIds((prev) => {
            const newGroupFieldIds = prev.filter((id) =>
                dimensionIds.includes(id),
            );

            const firstDimensionId = dimensionIds[0];
            if (newGroupFieldIds.length === 0 && firstDimensionId) {
                console.log('set dim after');
                return [firstDimensionId];
            }

            return prev;
        });

        setMetricId((prev) => {
            if (prev && allNumericMetricIds.includes(prev)) return prev;

            console.log('set met after');
            return allNumericMetricIds[0] ?? null;
        });
    }, [
        isLoading,
        currentChartType,
        dimensionIds,
        groupFieldIds,
        metricId,
        allNumericMetricIds,
        pieChartConfig?.groupFieldIds,
    ]);

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

        return Object.entries(
            resultsData.rows.reduce<Record<string, number>>((acc, row) => {
                const key = groupFieldIds
                    .map((groupFieldId) => row[groupFieldId]?.value?.formatted)
                    .filter(Boolean)
                    .join(' - ');

                const value = Number(row[metricId].value.raw);

                if (key && value !== undefined) {
                    acc[key] = (acc[key] ?? 0) + (isNaN(value) ? 0 : value);
                }

                return acc;
            }, {}),
        ).sort(([, aValue], [, bValue]) => {
            return bValue - aValue;
        });
    }, [resultsData, groupFieldIds, selectedMetric, metricId]);

    const groupLabels = useMemo(() => {
        return data.map(([label]) => label);
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

    const validPieChartConfig: PieChart = useMemo(
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
        ],
    );

    const values: PieChartConfig = useMemo(
        () => ({
            validPieChartConfig,

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

            data,
        }),
        [
            validPieChartConfig,

            groupFieldIds,
            handleGroupAdd,
            handleGroupChange,
            handleRemoveGroup,

            selectedMetric,
            metricId,

            isDonut,

            valueLabel,
            handleValueLabelChange,
            showValue,
            handleToggleShowValue,
            showPercentage,
            handleToggleShowPercentage,

            isValueLabelOverriden,
            isShowValueOverriden,
            isShowPercentageOverriden,

            defaultColors,

            sortedGroupLabels,
            groupLabelOverrides,
            handleGroupLabelChange,
            groupColorOverrides,
            groupColorDefaults,
            handleGroupColorChange,
            groupValueOptionOverrides,
            handleGroupValueOptionChange,
            groupSortOverrides,
            handleGroupSortChange,

            showLegend,

            data,
        ],
    );

    return values;
};

export default usePieChartConfig;
