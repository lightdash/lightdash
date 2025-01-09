import {
    FilterOperator,
    getItemId,
    type CompiledDimension,
    type FilterRule,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconFilter, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import {
    useFilterSelectStyles,
    useFilterTagInputStyles,
    useOperatorSelectStyles,
} from '../../styles/useFilterStyles';
import {
    createFilterRule,
    doesDimensionRequireValues,
    getOperatorOptions,
} from '../../utils/metricExploreFilter';
import SelectItem from '../SelectItem';

type Props = {
    dimensions: CompiledDimension[] | undefined;
    onFilterApply: (filterRule: FilterRule | undefined) => void;
};

interface FilterState {
    dimension: string | null;
    fieldId: string | null;
    operator: FilterOperator | null;
    values: string[];
}

export const MetricExploreFilter: FC<Props> = ({
    dimensions,
    onFilterApply,
}) => {
    const { classes: filterSelectClasses, theme } = useFilterSelectStyles();
    const { classes: operatorSelectClasses } = useOperatorSelectStyles();
    const { classes: tagInputClasses } = useFilterTagInputStyles();

    const [filterState, setFilterState] = useState<FilterState>({
        dimension: null,
        fieldId: null,
        operator: null,
        values: [],
    });
    const [activeFilter, setActiveFilter] = useState<FilterRule | undefined>();

    const selectedDimension = dimensions?.find(
        (d) => d.name === filterState.dimension,
    );

    const dimensionMetadata = useMemo(() => {
        if (!selectedDimension) return null;
        return {
            requiresValues: doesDimensionRequireValues(selectedDimension),
            type: selectedDimension.type,
        };
    }, [selectedDimension]);

    const isFilterValid = useMemo(() => {
        if (!filterState.dimension || !filterState.operator) return false;
        if (!dimensionMetadata?.requiresValues) return true;

        // Check if current filter state is different from active filter
        const hasChanges =
            !activeFilter ||
            filterState.fieldId !== activeFilter.target.fieldId ||
            filterState.operator !== activeFilter.operator ||
            JSON.stringify(filterState.values) !==
                JSON.stringify(activeFilter.values);

        return filterState.values.length > 0 && hasChanges;
    }, [filterState, dimensionMetadata, activeFilter]);

    const operatorOptions = getOperatorOptions(selectedDimension);

    const handleApplyFilter = useCallback(() => {
        const dimension = dimensions?.find(
            (d) => d.name === filterState.dimension,
        );
        if (!dimension || !filterState.operator) return;

        const filterRule = createFilterRule(
            dimension,
            filterState.operator,
            filterState.values,
        );

        setActiveFilter(filterRule);
        onFilterApply(filterRule);
    }, [dimensions, filterState, onFilterApply]);

    const handleClearFilter = () => {
        setActiveFilter(undefined);
        setFilterState({
            dimension: null,
            fieldId: null,
            operator: null,
            values: [],
        });
        onFilterApply(undefined);
    };

    const showClearButton = useMemo(() => {
        return filterState.dimension ? 'visible' : 'hidden';
    }, [filterState.dimension]);

    const showValuesSection = useMemo(() => {
        return dimensionMetadata?.requiresValues;
    }, [dimensionMetadata?.requiresValues]);

    const handleDimensionChange = (value: string | null) => {
        const newDimension = dimensions?.find((d) => d.name === value);
        if (!newDimension) return;
        const requiresValues = doesDimensionRequireValues(newDimension);

        const newState = {
            dimension: value,
            fieldId: getItemId(newDimension),
            operator: value ? FilterOperator.EQUALS : null,
            values: [],
        };

        setFilterState(newState);

        // Automatically apply filter for dimensions that do not require values
        if (!requiresValues && value) {
            const filterRule = createFilterRule(
                newDimension,
                FilterOperator.EQUALS,
                [],
            );
            setActiveFilter(filterRule);
            onFilterApply(filterRule);
        }
    };

    const handleOperatorChange = (value: string | null) => {
        const newOperator = value as FilterOperator;
        setFilterState((prev) => ({
            ...prev,
            operator: newOperator,
            values: showValuesSection ? prev.values : [],
        }));

        // Automatically apply filter for dimensions that do not require values
        if (
            !dimensionMetadata?.requiresValues &&
            newOperator &&
            selectedDimension
        ) {
            const filterRule = createFilterRule(
                selectedDimension,
                newOperator,
                [],
            );
            setActiveFilter(filterRule);
            onFilterApply(filterRule);
        }
    };

    return (
        <Stack spacing="xs">
            <Group position="apart">
                <Group spacing="xs" align="normal">
                    <Text fw={500} c="gray.7">
                        Filter
                    </Text>
                </Group>

                <Group spacing="xs">
                    <Button
                        variant="subtle"
                        compact
                        color="dark"
                        size="xs"
                        radius="md"
                        rightIcon={
                            <MantineIcon
                                icon={IconX}
                                color="gray.5"
                                size={12}
                            />
                        }
                        sx={{
                            '&:hover': {
                                backgroundColor: theme.colors.gray[1],
                            },
                            visibility: showClearButton,
                        }}
                        styles={{
                            rightIcon: {
                                marginLeft: 4,
                            },
                        }}
                        onClick={handleClearFilter}
                    >
                        Clear
                    </Button>
                </Group>
            </Group>

            <Stack
                spacing={0}
                sx={{
                    boxShadow: theme.shadows.subtle,
                    borderRadius: theme.radius.md,
                }}
            >
                <Select
                    placeholder="Filter by"
                    icon={<MantineIcon icon={IconFilter} />}
                    searchable
                    radius="md"
                    size="xs"
                    data={
                        dimensions?.map((dimension) => ({
                            value: dimension.name,
                            label: dimension.label,
                        })) ?? []
                    }
                    disabled={dimensions?.length === 0}
                    value={filterState.dimension}
                    itemComponent={SelectItem}
                    onChange={handleDimensionChange}
                    data-selected={!!filterState.dimension}
                    classNames={filterSelectClasses}
                />

                {filterState.dimension && (
                    <Group spacing={0} noWrap>
                        <Select
                            w={showValuesSection ? 90 : '100%'}
                            maw={showValuesSection ? 90 : '100%'}
                            placeholder="Condition"
                            data={operatorOptions}
                            value={filterState.operator}
                            onChange={handleOperatorChange}
                            size="xs"
                            radius="md"
                            classNames={{
                                input: operatorSelectClasses.input,
                                item: operatorSelectClasses.item,
                                dropdown: operatorSelectClasses.dropdown,
                                rightSection:
                                    operatorSelectClasses.rightSection,
                            }}
                            data-full-width={
                                !showValuesSection ? 'true' : 'false'
                            }
                        />
                        {showValuesSection && (
                            <TagInput
                                placeholder={
                                    filterState.operator
                                        ? 'Type values...'
                                        : undefined
                                }
                                value={filterState.values}
                                disabled={!filterState.operator}
                                onChange={(values) =>
                                    setFilterState((prev) => ({
                                        ...prev,
                                        values,
                                    }))
                                }
                                radius="md"
                                size="xs"
                                classNames={tagInputClasses}
                            />
                        )}
                    </Group>
                )}
            </Stack>
            {filterState.dimension && dimensionMetadata?.requiresValues && (
                <Button
                    color="dark"
                    compact
                    size="xs"
                    disabled={!isFilterValid}
                    sx={{
                        boxShadow: theme.shadows.subtle,
                        alignSelf: 'flex-end',
                    }}
                    onClick={handleApplyFilter}
                >
                    Apply
                </Button>
            )}
        </Stack>
    );
};
