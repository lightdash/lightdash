import {
    type Dashboard,
    type DashboardFilterRule,
    type FilterableDimension,
    type UnmetFilterRequirement,
} from '@lightdash/common';
import { Box, Center, Loader, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import FiltersProvider from '../../../../components/common/Filters/FiltersProvider';
import { useProject } from '../../../../hooks/useProject';
import useDashboardContext from '../../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../../providers/Dashboard/useDashboardTileStatusContext';
import { hasSavedFilterValueChanged } from '../../../dashboardFilters/FilterConfiguration/utils';
import {
    hasSchedulerFilterChanged,
    withDerivedDisabledState,
} from '../../utils/schedulerFilterOverrides';
import {
    RemovedSchedulerFilterItem,
    SchedulerFilterItem,
} from './SchedulerFilterItem';

const updateFilters = (
    updatedFilter: DashboardFilterRule,
    originalFilter: DashboardFilterRule,
    draftFilters: DashboardFilterRule[] | undefined,
): DashboardFilterRule[] | undefined => {
    const filterIndex =
        draftFilters?.findIndex((f) => f.id === updatedFilter.id) ?? -1;
    const isExistingFilter = filterIndex !== -1;

    const filterToCompareAgainst =
        draftFilters && isExistingFilter
            ? draftFilters[filterIndex]
            : originalFilter;

    if (hasSavedFilterValueChanged(filterToCompareAgainst, updatedFilter)) {
        const nextFilter = withDerivedDisabledState(updatedFilter);
        if (draftFilters && isExistingFilter) {
            return draftFilters.map((f) =>
                f.id === updatedFilter.id ? nextFilter : f,
            );
        }

        return [...(draftFilters ?? []), nextFilter];
    }
};

type SchedulerFiltersProps = {
    dashboard?: Dashboard;
    onChange: (schedulerFilters: DashboardFilterRule[]) => void;
    draftFilters: DashboardFilterRule[] | undefined;
    savedFilters: DashboardFilterRule[] | undefined;
    isEditMode: boolean;
    unmetRequirements: UnmetFilterRequirement[];
    filtersWithUnmetRequirements: DashboardFilterRule[];
};

export const SchedulerFormFiltersTab: FC<SchedulerFiltersProps> = ({
    dashboard,
    draftFilters,
    savedFilters,
    isEditMode,
    onChange,
    unmetRequirements,
    filtersWithUnmetRequirements,
}) => {
    const { data: project, isInitialLoading } = useProject(
        dashboard?.projectUuid,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const currentDashboardFilters = useDashboardContext((c) => c.allFilters);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const tileNamesById = useDashboardTileStatusContext((c) => c.tileNamesById);

    const { savedFiltersInDashboard, savedFiltersNotInDashboard } =
        useMemo(() => {
            const inDashboard: typeof savedFilters = [];
            const notInDashboard: typeof savedFilters = [];

            savedFilters?.forEach((filter) => {
                const isInDashboard = currentDashboardFilters.dimensions.some(
                    (d) => d.id === filter.id,
                );

                if (isInDashboard) {
                    inDashboard.push(filter);
                } else {
                    notInDashboard.push(filter);
                }
            });

            return {
                savedFiltersInDashboard: inDashboard ?? [],
                savedFiltersNotInDashboard: notInDashboard ?? [],
            };
        }, [savedFilters, currentDashboardFilters.dimensions]);

    // Seed the form with live filters exactly once (undefined = never seeded).
    // Checking for an empty array instead would re-seed after the user removes
    // the last filter, resurrecting every deleted filter.
    useEffect(() => {
        if (
            !isEditMode &&
            draftFilters === undefined &&
            !isLoadingDashboardFilters
        ) {
            onChange(currentDashboardFilters.dimensions);
        }
    }, [
        currentDashboardFilters.dimensions,
        isLoadingDashboardFilters,
        onChange,
        draftFilters,
        isEditMode,
    ]);

    const handleUpdateSchedulerFilter = useCallback(
        (
            updatedFilter?: DashboardFilterRule,
            originalFilter?: DashboardFilterRule,
        ) => {
            if (!updatedFilter || !originalFilter) {
                return;
            }

            const updatedFilters = updateFilters(
                updatedFilter,
                originalFilter,
                draftFilters,
            );

            onChange(updatedFilters ?? draftFilters ?? []);
        },
        [onChange, draftFilters],
    );

    const handleRemoveFilter = useCallback(
        (filterId: string) => {
            const updatedFilters = draftFilters?.filter(
                (f) => f.id !== filterId,
            );
            onChange(updatedFilters ?? []);
        },
        [onChange, draftFilters],
    );

    const handleRestoreFilter = useCallback(
        (dashboardFilter: DashboardFilterRule) => {
            onChange([...(draftFilters ?? []), dashboardFilter]);
        },
        [onChange, draftFilters],
    );

    if (isInitialLoading || isLoadingDashboardFilters || !project) {
        return (
            <Center component={Stack} h={100}>
                <Loader color="gray" />
                <Text c="dimmed">Loading dashboard filters...</Text>
            </Center>
        );
    }

    const unmetFilterIds = new Set(
        filtersWithUnmetRequirements.map((filter) => filter.id),
    );
    const hasUnmetSingles = unmetRequirements.some(
        (requirement) => requirement.type === 'single',
    );
    const hasUnmetGroups = unmetRequirements.some(
        (requirement) => requirement.type === 'group',
    );
    const isMissingRequiredValue = (dashboardFilter: DashboardFilterRule) =>
        unmetFilterIds.has(dashboardFilter.id);

    return (
        <FiltersProvider<Record<string, FilterableDimension>>
            popoverProps={{ withinPortal: true }}
            projectUuid={project.projectUuid}
            itemsMap={allFilterableFieldsMap}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            startOfWeek={project.warehouseConnection?.startOfWeek ?? undefined}
            dashboardFilters={currentDashboardFilters}
        >
            {currentDashboardFilters.dimensions.length +
                savedFiltersNotInDashboard.length >
            0 ? (
                <Stack mb="sm">
                    {hasUnmetSingles && (
                        <Text fz="xs" c="dimmed">
                            All required filters must have values
                        </Text>
                    )}
                    {hasUnmetGroups && (
                        <Text fz="xs" c="dimmed">
                            Set a value for at least one filter in each
                            requirement group
                        </Text>
                    )}
                    {currentDashboardFilters.dimensions.map(
                        (dashboardFilterRule) => {
                            const draftFilter = draftFilters?.find(
                                (f) => f.id === dashboardFilterRule.id,
                            );

                            if (!draftFilter) {
                                return (
                                    <RemovedSchedulerFilterItem
                                        key={dashboardFilterRule.id}
                                        savedFilter={dashboardFilterRule}
                                        defaultLabel="Uses dashboard default"
                                        onRestore={() =>
                                            handleRestoreFilter(
                                                dashboardFilterRule,
                                            )
                                        }
                                    />
                                );
                            }

                            const originalFilter = isEditMode
                                ? (savedFiltersInDashboard?.find(
                                      (sf) => sf.id === draftFilter.id,
                                  ) ?? dashboardFilterRule)
                                : dashboardFilterRule;

                            return (
                                <SchedulerFilterItem
                                    key={draftFilter.id}
                                    savedFilter={originalFilter}
                                    schedulerFilter={draftFilter}
                                    isMissingRequiredValue={isMissingRequiredValue(
                                        originalFilter,
                                    )}
                                    onChange={(updatedFilter) =>
                                        handleUpdateSchedulerFilter(
                                            updatedFilter,
                                            originalFilter,
                                        )
                                    }
                                    onRevert={() =>
                                        handleUpdateSchedulerFilter(
                                            originalFilter,
                                            originalFilter,
                                        )
                                    }
                                    hasChanged={hasSchedulerFilterChanged(
                                        draftFilter,
                                        originalFilter,
                                    )}
                                    onRemove={() =>
                                        handleRemoveFilter(draftFilter.id)
                                    }
                                    removeTooltip="Remove filter — the delivery will use the dashboard default"
                                />
                            );
                        },
                    )}
                    {savedFiltersNotInDashboard.length > 0 && (
                        <Text fz="xs" c="dimmed" mt="xs">
                            The following filters are applied to this scheduled
                            delivery but no longer exist in the dashboard
                        </Text>
                    )}
                    {savedFiltersNotInDashboard?.map((filter) => {
                        const schedulerFilter = draftFilters?.find(
                            (sf) => sf.id === filter.id,
                        );

                        if (!schedulerFilter) {
                            return null;
                        }

                        const tilesWithFilter = Object.entries(
                            schedulerFilter.tileTargets ?? {},
                        ).reduce<string[]>((acc, [tileUuid, isEnabled]) => {
                            if (isEnabled && tileNamesById[tileUuid]) {
                                acc.push(tileNamesById[tileUuid]);
                            }
                            return acc;
                        }, []);

                        return (
                            <Box key={filter.id}>
                                <SchedulerFilterItem
                                    key={filter.id}
                                    savedFilter={filter}
                                    schedulerFilter={schedulerFilter}
                                    isMissingRequiredValue={isMissingRequiredValue(
                                        filter,
                                    )}
                                    onChange={(updatedFilter) =>
                                        handleUpdateSchedulerFilter(
                                            updatedFilter,
                                            filter,
                                        )
                                    }
                                    onRevert={() =>
                                        handleUpdateSchedulerFilter(
                                            filter,
                                            filter,
                                        )
                                    }
                                    hasChanged={
                                        schedulerFilter
                                            ? hasSchedulerFilterChanged(
                                                  filter,
                                                  schedulerFilter,
                                              )
                                            : false
                                    }
                                    onRemove={() =>
                                        handleRemoveFilter(filter.id)
                                    }
                                    tilesWithFilter={tilesWithFilter}
                                />
                            </Box>
                        );
                    })}
                </Stack>
            ) : (
                <Center component={Stack} h={100}>
                    <Text color="dimmed">
                        No filters defined for this dashboard.
                    </Text>
                </Center>
            )}
        </FiltersProvider>
    );
};
