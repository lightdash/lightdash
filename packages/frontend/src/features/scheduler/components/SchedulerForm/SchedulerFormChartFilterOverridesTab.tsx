import {
    getFieldsFromMetricQuery,
    type FilterRule,
    type Filters,
    type ItemsMap,
    type SavedChart,
} from '@lightdash/common';
import { Center, Loader, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import FiltersProvider from '../../../../components/common/Filters/FiltersProvider';
import { useExploreByProjectUuid } from '../../../../hooks/useExplore';
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
    /** Opened from the chart page: the explorer's fields. Loaded otherwise. */
    itemsMap: ItemsMap | undefined;
    draftFilters: Filters | undefined;
    /** Edit mode: the overrides stored on the scheduler. */
    savedFilters: Filters | undefined;
    isEditMode: boolean;
    onChange: (schedulerFilters: Filters) => void;
    filtersWithUnmetRequirements: FilterRule[];
};

export const SchedulerFormChartFilterOverridesTab: FC<Props> = ({
    savedChart,
    itemsMap,
    draftFilters,
    savedFilters,
    isEditMode,
    onChange,
    filtersWithUnmetRequirements,
}) => {
    const { data: project, isInitialLoading: isLoadingProject } = useProject(
        savedChart.projectUuid,
    );
    const { data: explore, isInitialLoading: isLoadingExplore } =
        useExploreByProjectUuid(
            itemsMap ? undefined : savedChart.tableName,
            savedChart.projectUuid,
        );
    const fieldsMap = useMemo<ItemsMap | undefined>(
        () =>
            itemsMap ??
            (explore
                ? getFieldsFromMetricQuery(savedChart.metricQuery, explore)
                : undefined),
        [itemsMap, explore, savedChart.metricQuery],
    );
    const chartFilters = savedChart.metricQuery.filters;

    // Seed the form with the chart's saved rules exactly once (undefined =
    // never seeded). An empty object means the user removed every override.
    useEffect(() => {
        if (!isEditMode && draftFilters === undefined) {
            onChange(getChartFilterOverridesSeed(chartFilters));
        }
    }, [chartFilters, draftFilters, isEditMode, onChange]);

    const handleUpdateFilter = useCallback(
        (
            section: ChartFilterSection,
            updatedFilter: FilterRule,
            originalFilter: FilterRule,
        ) => {
            const updatedRules = updateChartFilterSectionRules(
                updatedFilter,
                originalFilter,
                getChartFilterSectionRules(draftFilters, section),
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
        [draftFilters, onChange],
    );

    const handleRemoveFilter = useCallback(
        (section: ChartFilterSection, filterId: string) => {
            onChange(
                setChartFilterSectionRules(
                    draftFilters,
                    section,
                    getChartFilterSectionRules(draftFilters, section).filter(
                        (f) => f.id !== filterId,
                    ),
                ),
            );
        },
        [draftFilters, onChange],
    );

    const handleRestoreFilter = useCallback(
        (section: ChartFilterSection, chartFilter: FilterRule) => {
            onChange(
                setChartFilterSectionRules(draftFilters, section, [
                    ...getChartFilterSectionRules(draftFilters, section),
                    chartFilter,
                ]),
            );
        },
        [draftFilters, onChange],
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
        const savedOverrides = getChartFilterSectionRules(
            savedFilters,
            section,
        );
        return {
            section,
            chartRules,
            savedOverrides,
            // Overrides whose rule the chart no longer has
            orphanOverrides: savedOverrides.filter(
                (rule) => !chartRuleIds.has(rule.id),
            ),
            draftRules: getChartFilterSectionRules(draftFilters, section),
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
            startOfWeek={project.warehouseConnection?.startOfWeek ?? undefined}
        >
            {hasRules ? (
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

                                if (!draftRule) {
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
                                          (rule) => rule.id === draftRule.id,
                                      ) ?? chartRule)
                                    : chartRule;

                                return (
                                    <SchedulerFilterItem
                                        key={draftRule.id}
                                        savedFilter={originalFilter}
                                        schedulerFilter={draftRule}
                                        isMissingRequiredValue={unmetFilterIds.has(
                                            chartRule.id,
                                        )}
                                        onChange={(updatedFilter) =>
                                            handleUpdateFilter(
                                                section,
                                                updatedFilter,
                                                originalFilter,
                                            )
                                        }
                                        onRevert={() =>
                                            handleUpdateFilter(
                                                section,
                                                originalFilter,
                                                originalFilter,
                                            )
                                        }
                                        hasChanged={hasSchedulerFilterChanged(
                                            draftRule,
                                            originalFilter,
                                        )}
                                        onRemove={() =>
                                            handleRemoveFilter(
                                                section,
                                                draftRule.id,
                                            )
                                        }
                                        removeTooltip="Remove filter — the delivery will use the chart default"
                                    />
                                );
                            }),
                    )}
                    {hasOrphans && (
                        <Text fz="xs" c="dimmed" mt="xs">
                            The following filters are applied to this scheduled
                            delivery but no longer exist in the chart
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
