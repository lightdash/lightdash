import {
    FilterType,
    getFilterTypeFromItem,
    isWithValueFilter,
    type Dashboard,
    type DashboardFilterRule,
    type FilterableDimension,
    type FilterOperator,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Flex,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconPencil,
    IconRotate2,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { hasSavedFilterValueChanged } from '../../../components/DashboardFilter/FilterConfiguration/utils';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import FieldLabel from '../../../components/common/Filters/FieldLabel';
import FilterInputComponent from '../../../components/common/Filters/FilterInputs';
import {
    getConditionalRuleLabelFromItem,
    getFilterOperatorOptions,
} from '../../../components/common/Filters/FilterInputs/utils';
import FiltersProvider from '../../../components/common/Filters/FiltersProvider';
import useFiltersContext from '../../../components/common/Filters/useFiltersContext';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProject } from '../../../hooks/useProject';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';

const FilterSummaryLabel: FC<
    {
        filterSummary: ReturnType<typeof getConditionalRuleLabelFromItem>;
    } & Record<'isDisabled', boolean>
> = ({ filterSummary, isDisabled }) => {
    if (isDisabled) {
        return (
            <Text fw={400} span>
                <Text span color="ldGray.6">
                    is any value
                </Text>
            </Text>
        );
    }
    return (
        <Text fw={400} span>
            <Text span color="ldGray.7">
                {filterSummary?.operator}{' '}
            </Text>
            <Text fw={700} span>
                {filterSummary?.value}
            </Text>
        </Text>
    );
};

type SchedulerFilterItemProps = {
    dashboardFilter: DashboardFilterRule;
    schedulerFilter?: DashboardFilterRule;
    onChange: (schedulerFilter: DashboardFilterRule) => void;
    onRevert: () => void;
    hasChanged: boolean;
    onRemove?: () => void;
    tilesWithFilter?: string[];
};

const FilterItem: FC<SchedulerFilterItemProps> = ({
    dashboardFilter,
    schedulerFilter,
    onChange,
    onRevert,
    hasChanged,
    onRemove,
    tilesWithFilter,
}) => {
    const theme = useMantineTheme();
    const { itemsMap } =
        useFiltersContext<Record<string, FilterableDimension>>();
    const field = itemsMap[dashboardFilter.target.fieldId];
    const [isEditing, setIsEditing] = useState(false);

    const filterType = useMemo(() => {
        return field ? getFilterTypeFromItem(field) : FilterType.STRING;
    }, [field]);

    const isDisabled = useMemo(
        () => Boolean((schedulerFilter ?? dashboardFilter).disabled),
        [schedulerFilter, dashboardFilter],
    );

    const filterOperatorOptions = useMemo(() => {
        return getFilterOperatorOptions(filterType);
    }, [filterType]);

    if (!field) {
        // show invalid dashboard filter
        return (
            <Group spacing="xs" align="flex-start" noWrap>
                <ActionIcon size="xs" disabled>
                    <MantineIcon icon={IconRotate2} />
                </ActionIcon>

                <Stack key={dashboardFilter.id} spacing="xs" w="100%">
                    <Group spacing="xs">
                        <MantineIcon
                            icon={IconAlertTriangle}
                            color="red.6"
                            style={{ color: theme.colors.red[6] }}
                        />
                        <Text span fw={500}>
                            Invalid filter
                        </Text>
                        <Text fw={400} span>
                            <Text span color="ldGray.6">
                                Tried to reference field with unknown id:
                            </Text>
                            <Text span> {dashboardFilter.target.fieldId}</Text>
                        </Text>
                    </Group>
                </Stack>
            </Group>
        );
    }

    return (
        <Group spacing="xs" align="flex-start" noWrap>
            <Tooltip label="Reset filter" fz="xs" disabled={!hasChanged}>
                <ActionIcon
                    size="xs"
                    disabled={!hasChanged}
                    onClick={() => {
                        if (isEditing) {
                            setIsEditing(false);
                        }
                        onRevert();
                    }}
                >
                    <MantineIcon icon={IconRotate2} />
                </ActionIcon>
            </Tooltip>

            <Stack key={dashboardFilter.id} spacing="xs" w="100%">
                <Group spacing="xs">
                    <FieldIcon item={field} />
                    <FieldLabel
                        item={{
                            ...field,
                            label: dashboardFilter.label ?? field.label,
                        }}
                        hideTableName
                    />
                    <>
                        {isEditing ? null : (
                            <FilterSummaryLabel
                                filterSummary={getConditionalRuleLabelFromItem(
                                    schedulerFilter ?? dashboardFilter,
                                    field,
                                )}
                                isDisabled={isDisabled}
                            />
                        )}

                        <ActionIcon
                            size="xs"
                            onClick={() => {
                                setIsEditing(!isEditing);
                            }}
                        >
                            <MantineIcon
                                icon={isEditing ? IconCheck : IconPencil}
                            />
                        </ActionIcon>
                        {onRemove && (
                            <ActionIcon size="xs" onClick={onRemove}>
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        )}
                        {dashboardFilter.required &&
                            !isEditing &&
                            (!schedulerFilter?.values ||
                                schedulerFilter?.values?.length === 0) && (
                                <Text fz="sm" color="red">
                                    *
                                </Text>
                            )}
                        {tilesWithFilter && tilesWithFilter.length > 0 && (
                            <Tooltip
                                label={`Applies to: ${tilesWithFilter.join(
                                    ', ',
                                )}`}
                                fz="xs"
                                multiline
                                w={200}
                            >
                                <Text fz="xs" color="ldGray.6" span>
                                    {`Applies to ${tilesWithFilter.length} tiles`}
                                </Text>
                            </Tooltip>
                        )}
                    </>
                </Group>
                {!isEditing && hasChanged && (
                    <Text fz="xs" color="ldGray.6">
                        Unsaved changes
                    </Text>
                )}

                {isEditing && (
                    <Flex gap="xs">
                        <Select
                            style={{
                                flex: '0 0 180px',
                            }}
                            size="xs"
                            value={
                                schedulerFilter?.operator ??
                                dashboardFilter.operator
                            }
                            data={filterOperatorOptions}
                            onChange={(operator: FilterOperator) => {
                                const newFilter = {
                                    ...dashboardFilter,
                                    operator,
                                    values: isWithValueFilter(operator)
                                        ? dashboardFilter.values
                                        : undefined,
                                };

                                onChange(newFilter);
                            }}
                            withinPortal
                        />

                        <FilterInputComponent
                            filterType={filterType}
                            field={field}
                            rule={schedulerFilter ?? dashboardFilter}
                            onChange={(newFilter) => {
                                onChange(newFilter);
                            }}
                            popoverProps={{ withinPortal: true }}
                        />
                    </Flex>
                )}
            </Stack>
        </Group>
    );
};

const hasFilterChanged = (
    filterToCompareAgainst: DashboardFilterRule,
    updatedFilter: DashboardFilterRule,
) =>
    // Check if the filter has changed, ignoring disabled state.
    // The inputs this component uses do not include enabling/disabling filters.
    hasSavedFilterValueChanged(
        { ...filterToCompareAgainst, disabled: undefined },
        { ...updatedFilter, disabled: undefined },
    );

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

    // Manually enable/disable filters based on the values.
    // The inputs this component uses do not include enabling/disabling filters.
    // If the operator is a value filter, the filter is disabled if the values are empty or undefined.
    const isDisabled =
        isWithValueFilter(updatedFilter.operator) &&
        (updatedFilter.values?.length === 0 ||
            updatedFilter?.values?.length === undefined);

    if (hasSavedFilterValueChanged(filterToCompareAgainst, updatedFilter)) {
        if (draftFilters && isExistingFilter) {
            return draftFilters.map((f) =>
                f.id === updatedFilter.id
                    ? {
                          ...updatedFilter,
                          disabled: isDisabled,
                      }
                    : f,
            );
        }

        return [
            ...(draftFilters ?? []),
            {
                ...updatedFilter,
                disabled: isDisabled,
            },
        ];
    }
};

type SchedulerFiltersProps = {
    dashboard?: Dashboard;
    onChange: (schedulerFilters: DashboardFilterRule[]) => void;
    draftFilters: DashboardFilterRule[] | undefined;
    savedFilters: DashboardFilterRule[] | undefined;
    isEditMode: boolean;
};

const SchedulerFilters: FC<SchedulerFiltersProps> = ({
    dashboard,
    draftFilters,
    savedFilters,
    isEditMode,
    onChange,
}) => {
    const { data: project, isInitialLoading } = useProject(
        dashboard?.projectUuid,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const currentDashboardFilters = useDashboardContext((c) => c.allFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const tileNamesById = useDashboardContext((c) => c.tileNamesById);

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

    // Initialize form with live filters if no saved filters exist
    useEffect(() => {
        if (
            !isEditMode &&
            draftFilters?.length === 0 &&
            currentDashboardFilters.dimensions.length > 0
        ) {
            onChange(currentDashboardFilters.dimensions);
        }
    }, [
        currentDashboardFilters.dimensions,
        savedFilters,
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

    if (isInitialLoading || isLoadingDashboardFilters || !project) {
        return (
            <Center component={Stack} h={100}>
                <Loader color="gray" />
                <Text color="dimmed">Loading dashboard filters...</Text>
            </Center>
        );
    }

    const requiredFiltersWithoutValues = (draftFilters ?? []).filter(
        (filter) =>
            filter.required && (!filter.values || filter.values.length === 0),
    );

    return (
        <FiltersProvider<Record<string, FilterableDimension>>
            popoverProps={{ withinPortal: true }}
            projectUuid={project.projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={project.warehouseConnection?.startOfWeek ?? undefined}
            dashboardFilters={currentDashboardFilters}
        >
            {(draftFilters?.length ?? 0) + savedFiltersNotInDashboard?.length >
            0 ? (
                <Stack mb="sm">
                    {requiredFiltersWithoutValues.length > 0 && (
                        <Text fz="xs" color="ldGray.6">
                            All required filters must have values
                        </Text>
                    )}
                    {draftFilters?.map((filter) => {
                        const originalFilter = isEditMode
                            ? savedFiltersInDashboard?.find(
                                  (sf) => sf.id === filter.id,
                              )
                            : currentDashboardFilters.dimensions.find(
                                  (d) => d.id === filter.id,
                              );

                        if (!originalFilter) {
                            return null;
                        }

                        return (
                            <FilterItem
                                key={filter.id}
                                dashboardFilter={originalFilter}
                                schedulerFilter={filter}
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
                                hasChanged={
                                    originalFilter
                                        ? hasFilterChanged(
                                              filter,
                                              originalFilter,
                                          )
                                        : false
                                }
                            />
                        );
                    })}
                    {savedFiltersNotInDashboard.length > 0 && (
                        <Text fz="xs" color="ldGray.6" mt="xs">
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
                                <FilterItem
                                    key={filter.id}
                                    dashboardFilter={filter}
                                    schedulerFilter={schedulerFilter}
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
                                            ? hasFilterChanged(
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

export default SchedulerFilters;
