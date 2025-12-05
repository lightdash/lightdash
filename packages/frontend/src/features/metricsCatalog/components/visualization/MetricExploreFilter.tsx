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
import {
    useFilterSelectStyles,
    useOperatorSelectStyles,
} from '../../styles/useFilterStyles';
import {
    createFilterRule,
    doesDimensionRequireValues,
    getOperatorOptions,
} from '../../utils/metricExploreFilter';
import SelectItem from '../SelectItem';
import { MetricExploreFilterAutoComplete } from './MetricExploreFilterAutoComplete';

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

    const [filterState, setFilterState] = useState<FilterState>({
        dimension: null,
        fieldId: null,
        operator: null,
        values: [],
    });
    const [activeFilter, setActiveFilter] = useState<FilterRule | undefined>();

    const selectedDimension = dimensions?.find(
        (d) => getItemId(d) === filterState.fieldId,
    );

    const operatorOptions = getOperatorOptions(selectedDimension);
    const dimensionMetadata = useMemo(() => {
        if (!selectedDimension) return null;
        return {
            requiresValues: doesDimensionRequireValues(selectedDimension),
            type: selectedDimension.type,
        };
    }, [selectedDimension]);

    const canApplyFilter = useMemo(() => {
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

    const handleApplyFilter = useCallback(() => {
        const dimension = dimensions?.find(
            (d) => getItemId(d) === filterState.fieldId,
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

    const handleDimensionChange = useCallback(
        (fieldId: string | null) => {
            const newDimension = dimensions?.find(
                (d) => getItemId(d) === fieldId,
            );
            if (!newDimension) return;
            const requiresValues = doesDimensionRequireValues(newDimension);

            const newState = {
                dimension: newDimension.name,
                fieldId: getItemId(newDimension),
                operator: FilterOperator.EQUALS,
                values: [],
            };

            setFilterState(newState);

            // Automatically apply filter for dimensions that do not require values
            if (!requiresValues && newDimension) {
                const filterRule = createFilterRule(
                    newDimension,
                    FilterOperator.EQUALS,
                    [],
                );
                setActiveFilter(filterRule);
                onFilterApply(filterRule);
            }
        },
        [dimensions, onFilterApply],
    );

    const handleOperatorChange = useCallback(
        (operator: FilterOperator | null) => {
            setFilterState((prev) => ({
                ...prev,
                operator,
                values: showValuesSection ? prev.values : [],
            }));

            // Automatically apply filter for dimensions that do not require values
            if (!showValuesSection && operator && selectedDimension) {
                const filterRule = createFilterRule(
                    selectedDimension,
                    operator,
                    [],
                );
                setActiveFilter(filterRule);
                onFilterApply(filterRule);
            }
        },
        [showValuesSection, selectedDimension, onFilterApply],
    );

    const handleTagInputChange = useCallback((values: string[]) => {
        setFilterState((prev) => ({
            ...prev,
            values,
        }));
    }, []);

    return (
        <Stack spacing="xs">
            <Group position="apart">
                <Group spacing="xs" align="normal">
                    <Text fw={500} c="ldGray.7">
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
                                color="ldGray.5"
                                size={12}
                            />
                        }
                        sx={{
                            '&:hover': {
                                backgroundColor: theme.colors.ldGray[1],
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
                <Group spacing={0} noWrap>
                    <Select
                        placeholder="Filter by"
                        icon={<MantineIcon icon={IconFilter} />}
                        searchable
                        withinPortal
                        radius="md"
                        size="xs"
                        data={
                            dimensions?.map((dimension) => ({
                                value: getItemId(dimension),
                                label: dimension.label,
                                group: dimension.tableLabel,
                            })) ?? []
                        }
                        disabled={dimensions?.length === 0}
                        value={filterState.fieldId}
                        itemComponent={SelectItem}
                        onChange={handleDimensionChange}
                        data-selected={!!filterState.fieldId}
                        data-no-values={!showValuesSection ? 'true' : 'false'}
                        classNames={filterSelectClasses}
                    />

                    {filterState.fieldId && (
                        <Select
                            placeholder="Condition"
                            withinPortal
                            data={operatorOptions}
                            value={filterState.operator}
                            onChange={handleOperatorChange}
                            size="xs"
                            radius="md"
                            classNames={operatorSelectClasses}
                            data-no-values={
                                !showValuesSection ? 'true' : 'false'
                            }
                            data-full-width={
                                !showValuesSection ? 'true' : 'false'
                            }
                        />
                    )}
                </Group>

                {showValuesSection && selectedDimension && (
                    <MetricExploreFilterAutoComplete
                        dimension={selectedDimension}
                        values={filterState.values}
                        onChange={handleTagInputChange}
                        placeholder={
                            filterState.operator ? 'Type values...' : undefined
                        }
                        disabled={!filterState.operator}
                    />
                )}
            </Stack>
            {filterState.fieldId && dimensionMetadata?.requiresValues && (
                <Button
                    color={theme.colorScheme === 'dark' ? 'ldGray.2' : 'dark'}
                    compact
                    size="xs"
                    disabled={!canApplyFilter}
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
