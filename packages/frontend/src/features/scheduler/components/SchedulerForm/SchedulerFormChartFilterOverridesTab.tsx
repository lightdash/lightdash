import {
    getChartFilterRuleOverrideMatches,
    getItemMap,
    type FilterRule,
    type Filters,
    type ItemsMap,
    type SavedChart,
} from '@lightdash/common';
import { Center, Loader, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import FiltersProvider from '../../../../components/common/Filters/FiltersProvider';
import { useExploreByProjectUuid } from '../../../../hooks/useExplore';
import { useExploreWarehouseConnection } from '../../../../hooks/useExploreWarehouseConnection';
import { useProject } from '../../../../hooks/useProject';
import {
    CHART_FILTER_SECTIONS,
    getChartFilterOverridesSeed,
    getChartFilterSectionRules,
    hasSchedulerFilterChanged,
    setChartFilterSectionRules,
    updateChartFilterSectionRules,
    type ChartFilterSection,
} from '../../utils/schedulerFilterOverrides';
import {
    RemovedSchedulerFilterItem,
    SchedulerFilterItem,
} from './SchedulerFilterItem';

export type SchedulerChartFilterSource = Pick<
    SavedChart,
    'projectUuid' | 'tableName' | 'metricQuery'
>;

type Props = {
    savedChart: SchedulerChartFilterSource;
    /** Chart query result fields, available if the Explore cannot be loaded. */
    itemsMap: ItemsMap | undefined;
    draftFilters: Filters | undefined;
    /** Edit mode: the overrides stored on the scheduler. */
    savedFilters: Filters | undefined;
    isEditMode: boolean;
    onChange: (schedulerFilters: Filters) => void;
    filtersWithUnmetRequirements: FilterRule[];
    /** The user cannot replace the chart's filters: show them, seed nothing. */
    readOnly?: boolean;
    /** Inherit each saved rule until the sync explicitly overrides its value. */
    inheritDefaults?: boolean;
};

export const SchedulerFormChartFilterOverridesTab: FC<Props> = ({
    savedChart,
    itemsMap,
    draftFilters,
    savedFilters,
    isEditMode,
    onChange,
    filtersWithUnmetRequirements,
    readOnly = false,
    inheritDefaults = false,
}) => {
    const { data: project, isInitialLoading: isLoadingProject } = useProject(
        savedChart.projectUuid,
    );
    const { data: explore, isInitialLoading: isLoadingExplore } =
        useExploreByProjectUuid(savedChart.tableName, savedChart.projectUuid);
    const { startOfWeek, warehouseType } = useExploreWarehouseConnection(
        savedChart.tableName,
        savedChart.projectUuid,
    );
    const fieldsMap = useMemo<ItemsMap | undefined>(() => {
        if (!explore) return itemsMap;
        const { metricQuery } = savedChart;
        return getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
            metricQuery.customDimensions,
        );
    }, [itemsMap, explore, savedChart.metricQuery]);
    const chartFilters = savedChart.metricQuery.filters;

    // Seed the form with the chart's saved rules exactly once (undefined =
    // never seeded). An empty object means the user removed every override.
    useEffect(() => {
        if (
            !inheritDefaults &&
            !readOnly &&
            !isEditMode &&
            draftFilters === undefined
        ) {
            onChange(getChartFilterOverridesSeed(chartFilters));
        }
    }, [
        chartFilters,
        draftFilters,
        inheritDefaults,
        isEditMode,
        onChange,
        readOnly,
    ]);

    const getOverrideRules = useCallback(
        (filters: Filters | undefined, section: ChartFilterSection) => {
            const rules = getChartFilterSectionRules(filters, section);
            if (!inheritDefaults || rules.length === 0) return rules;

            const { overrideBySavedRuleId } = getChartFilterRuleOverrideMatches(
                getChartFilterSectionRules(chartFilters, section),
                rules,
            );
            // Keep the scheduler's match stable when an edit rewrites this section.
            const chartIdByOverrideId = new Map(
                Array.from(overrideBySavedRuleId, ([chartId, rule]) => [
                    rule.id,
                    chartId,
                ]),
            );
            return rules.map((rule) => {
                const id = chartIdByOverrideId.get(rule.id);
                return id && id !== rule.id ? { ...rule, id } : rule;
            });
        },
        [chartFilters, inheritDefaults],
    );

    const handleUpdateFilter = useCallback(
        (
            section: ChartFilterSection,
            updatedFilter: FilterRule,
            originalFilter: FilterRule,
        ) => {
            const updatedRules = updateChartFilterSectionRules(
                updatedFilter,
                originalFilter,
                getOverrideRules(draftFilters, section),
            );
            if (updatedRules) {
                onChange(
                    setChartFilterSectionRules(
                        draftFilters,
                        section,
                        updatedRules,
                    ),
                );
            }
        },
        [draftFilters, getOverrideRules, onChange],
    );

    const handleRemoveFilter = useCallback(
        (section: ChartFilterSection, filterId: string) => {
            onChange(
                setChartFilterSectionRules(
                    draftFilters,
                    section,
                    getOverrideRules(draftFilters, section).filter(
                        (f) => f.id !== filterId,
                    ),
                ),
            );
        },
        [draftFilters, getOverrideRules, onChange],
    );

    const handleRestoreFilter = useCallback(
        (section: ChartFilterSection, chartFilter: FilterRule) => {
            onChange(
                setChartFilterSectionRules(draftFilters, section, [
                    ...getOverrideRules(draftFilters, section),
                    chartFilter,
                ]),
            );
        },
        [draftFilters, getOverrideRules, onChange],
    );

    if (isLoadingProject || isLoadingExplore || !project || !fieldsMap) {
        return (
            <Center component={Stack} h={100}>
                <Loader color="gray" />
                <Text c="dimmed">Loading chart filters...</Text>
            </Center>
        );
    }

    const unmetFilterIds = new Set(
        filtersWithUnmetRequirements.map((filter) => filter.id),
    );
    const sections = CHART_FILTER_SECTIONS.map((section) => {
        const chartRules = getChartFilterSectionRules(chartFilters, section);
        const chartRuleIds = new Set(chartRules.map((rule) => rule.id));
        const savedOverrides = getOverrideRules(savedFilters, section);
        return {
            section,
            chartRules,
            savedOverrides,
            // Overrides whose rule the chart no longer has
            orphanOverrides: savedOverrides.filter(
                (rule) => !chartRuleIds.has(rule.id),
            ),
            draftRules: getOverrideRules(draftFilters, section),
        };
    });
    const hasRules = sections.some(
        ({ chartRules, orphanOverrides }) =>
            chartRules.length + orphanOverrides.length > 0,
    );
    const hasOrphans = sections.some(
        ({ orphanOverrides }) => orphanOverrides.length > 0,
    );

    return (
        <FiltersProvider
            popoverProps={{ withinPortal: true }}
            projectUuid={project.projectUuid}
            itemsMap={fieldsMap}
            startOfWeek={startOfWeek ?? undefined}
            warehouseType={warehouseType}
        >
            {readOnly && hasRules ? (
                <Stack mb="sm">
                    <Text fz="xs" c="dimmed">
                        Adjusting these filters for a delivery needs explore
                        access to the project. The delivery uses the chart's
                        saved filters.
                    </Text>
                    {sections.map(({ chartRules }) =>
                        chartRules.map((chartRule) => (
                            <SchedulerFilterItem
                                key={chartRule.id}
                                savedFilter={chartRule}
                                isMissingRequiredValue={false}
                                onChange={() => {}}
                                onRevert={() => {}}
                                hasChanged={false}
                                readOnly
                            />
                        )),
                    )}
                </Stack>
            ) : hasRules ? (
                <Stack mb="sm">
                    {filtersWithUnmetRequirements.length > 0 && (
                        <Text fz="xs" c="dimmed">
                            All required filters must have values
                        </Text>
                    )}
                    {sections.map(
                        ({ section, chartRules, savedOverrides, draftRules }) =>
                            chartRules.map((chartRule) => {
                                const draftRule = draftRules.find(
                                    (rule) => rule.id === chartRule.id,
                                );

                                if (!draftRule && !inheritDefaults) {
                                    return (
                                        <RemovedSchedulerFilterItem
                                            key={chartRule.id}
                                            savedFilter={chartRule}
                                            defaultLabel="Uses chart default"
                                            onRestore={() =>
                                                handleRestoreFilter(
                                                    section,
                                                    chartRule,
                                                )
                                            }
                                        />
                                    );
                                }

                                const originalFilter = isEditMode
                                    ? (savedOverrides.find(
                                          (rule) => rule.id === chartRule.id,
                                      ) ?? chartRule)
                                    : chartRule;

                                return (
                                    <SchedulerFilterItem
                                        key={chartRule.id}
                                        savedFilter={
                                            inheritDefaults
                                                ? chartRule
                                                : originalFilter
                                        }
                                        valuesOnly={inheritDefaults}
                                        schedulerFilter={draftRule}
                                        isMissingRequiredValue={unmetFilterIds.has(
                                            chartRule.id,
                                        )}
                                        onChange={(updatedFilter) => {
                                            if (
                                                inheritDefaults &&
                                                !hasSchedulerFilterChanged(
                                                    updatedFilter,
                                                    chartRule,
                                                )
                                            ) {
                                                handleRemoveFilter(
                                                    section,
                                                    chartRule.id,
                                                );
                                            } else {
                                                handleUpdateFilter(
                                                    section,
                                                    updatedFilter,
                                                    originalFilter,
                                                );
                                            }
                                        }}
                                        onRevert={() => {
                                            if (
                                                inheritDefaults &&
                                                originalFilter === chartRule
                                            ) {
                                                handleRemoveFilter(
                                                    section,
                                                    chartRule.id,
                                                );
                                            } else if (!draftRule) {
                                                handleRestoreFilter(
                                                    section,
                                                    originalFilter,
                                                );
                                            } else {
                                                handleUpdateFilter(
                                                    section,
                                                    originalFilter,
                                                    originalFilter,
                                                );
                                            }
                                        }}
                                        hasChanged={hasSchedulerFilterChanged(
                                            draftRule ?? chartRule,
                                            originalFilter,
                                        )}
                                        onRemove={
                                            draftRule
                                                ? () =>
                                                      handleRemoveFilter(
                                                          section,
                                                          chartRule.id,
                                                      )
                                                : undefined
                                        }
                                        removeTooltip={
                                            inheritDefaults
                                                ? 'Use chart default'
                                                : 'Remove filter — the delivery will use the chart default'
                                        }
                                    />
                                );
                            }),
                    )}
                    {hasOrphans && (
                        <Text fz="xs" c="dimmed" mt="xs">
                            {inheritDefaults
                                ? 'These filters still apply to this sync but are no longer saved on the chart.'
                                : 'The following filters are applied to this scheduled delivery but no longer exist in the chart'}
                        </Text>
                    )}
                    {sections.map(({ section, orphanOverrides, draftRules }) =>
                        orphanOverrides.map((orphanRule) => {
                            const draftRule = draftRules.find(
                                (rule) => rule.id === orphanRule.id,
                            );
                            if (!draftRule) return null;

                            return (
                                <SchedulerFilterItem
                                    key={orphanRule.id}
                                    savedFilter={orphanRule}
                                    readOnly={inheritDefaults}
                                    schedulerFilter={draftRule}
                                    isMissingRequiredValue={false}
                                    onChange={(updatedFilter) =>
                                        handleUpdateFilter(
                                            section,
                                            updatedFilter,
                                            orphanRule,
                                        )
                                    }
                                    onRevert={() =>
                                        handleUpdateFilter(
                                            section,
                                            orphanRule,
                                            orphanRule,
                                        )
                                    }
                                    hasChanged={hasSchedulerFilterChanged(
                                        orphanRule,
                                        draftRule,
                                    )}
                                    onRemove={() =>
                                        handleRemoveFilter(
                                            section,
                                            orphanRule.id,
                                        )
                                    }
                                />
                            );
                        }),
                    )}
                </Stack>
            ) : (
                <Center component={Stack} h={100}>
                    <Text c="dimmed">No filters defined for this chart.</Text>
                </Center>
            )}
        </FiltersProvider>
    );
};
