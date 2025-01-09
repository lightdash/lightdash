import {
    FilterOperator,
    type CompiledDimension,
    type FilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconFilter, IconPencil, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import {
    useFilterSelectStyles,
    useFilterTagInputStyles,
    useOperatorSelectStyles,
} from '../../styles/useFilterStyles';
import {
    createFilterRule,
    getOperatorOptions,
} from '../../utils/metricExploreFilter';
import SelectItem from '../SelectItem';

type Props = {
    dimensions: CompiledDimension[] | undefined;
    onFilterApply: (filterRule: FilterRule | undefined) => void;
};

interface FilterState {
    dimension: string | null;
    operator: FilterOperator | null;
    values: string[];
}

export const MetricExploreFilter: FC<Props> = ({
    dimensions,
    onFilterApply,
}) => {
    const { classes: filterSelectClasses, theme } = useFilterSelectStyles();
    const { classes: operatorSelectClasses, cx } = useOperatorSelectStyles();
    const { classes: tagInputClasses } = useFilterTagInputStyles();

    const [filterState, setFilterState] = useState<FilterState>({
        dimension: null,
        operator: null,
        values: [],
    });
    const [mode, setMode] = useState<'read' | 'edit'>('read');
    const [activeFilter, setActiveFilter] = useState<FilterRule | undefined>();

    const selectedDimension = dimensions?.find(
        (d) => d.name === filterState.dimension,
    );

    const dimensionMetadata = useMemo(() => {
        if (!selectedDimension) return null;
        return {
            requiresValues: selectedDimension.type !== 'boolean',
            type: selectedDimension.type,
        };
    }, [selectedDimension]);

    const isFilterValid = useMemo(() => {
        if (!filterState.dimension || !filterState.operator) return false;
        if (!dimensionMetadata?.requiresValues) return true;
        return filterState.values.length > 0;
    }, [filterState, dimensionMetadata]);

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
        setMode('read');
        onFilterApply(filterRule);
    }, [dimensions, filterState, onFilterApply]);

    const handleClearFilter = () => {
        setMode('edit');
        setActiveFilter(undefined);
        setFilterState({
            dimension: null,
            operator: null,
            values: [],
        });
        onFilterApply(undefined);
    };

    const handleEditFilter = () => {
        setMode('edit');
    };

    useEffect(() => {
        if (activeFilter) {
            setMode('read');
        } else {
            setMode('edit');
        }
    }, [activeFilter]);

    const isFilterApplied = useMemo(() => {
        return Boolean(activeFilter && mode === 'read');
    }, [activeFilter, mode]);

    const showClearButton = useMemo(() => {
        return filterState.dimension ? 'visible' : 'hidden';
    }, [filterState.dimension]);

    const showValuesSection = useMemo(() => {
        return dimensionMetadata?.requiresValues;
    }, [dimensionMetadata?.requiresValues]);

    return (
        <Stack spacing="xs">
            <Group position="apart">
                <Group spacing="xs" align="normal">
                    <Text fw={500} c="gray.7">
                        Filter
                    </Text>

                    {isFilterApplied && (
                        <Tooltip variant="xs" label="Edit filter">
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="xs"
                                onClick={handleEditFilter}
                            >
                                <MantineIcon icon={IconPencil} />
                            </ActionIcon>
                        </Tooltip>
                    )}
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
                    onChange={(value) =>
                        setFilterState((prev) => ({
                            ...prev,
                            dimension: value,
                            operator: value ? FilterOperator.EQUALS : null,
                            values: [],
                        }))
                    }
                    data-selected={!!filterState.dimension || mode === 'read'}
                    classNames={filterSelectClasses}
                    readOnly={mode === 'read' ? true : undefined}
                />

                {isFilterApplied && (
                    <Group
                        h={32}
                        position="left"
                        sx={{
                            border: `1px solid ${theme.colors.gray[2]}`,
                            borderRadius: theme.radius.md,
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            borderTop: 0,
                            backgroundColor: 'white',
                        }}
                        noWrap
                        grow={!showValuesSection}
                        spacing={0}
                    >
                        <Box
                            p="xs"
                            bg="gray.0"
                            h={32}
                            maw={showValuesSection ? 'fit-content' : '100%'}
                            sx={{
                                borderBottomLeftRadius: theme.radius.md,
                                ...(!showValuesSection && {
                                    borderBottomRightRadius: theme.radius.md,
                                }),
                            }}
                        >
                            <Text fw={550} c="dark.6" lh={1.2}>
                                {
                                    operatorOptions.find(
                                        (op) =>
                                            op.value === filterState.operator,
                                    )?.label
                                }
                            </Text>
                        </Box>
                        {showValuesSection && (
                            <>
                                <Divider
                                    orientation="vertical"
                                    color="gray.2"
                                    sx={{
                                        flexGrow: 0,
                                    }}
                                />

                                <Box
                                    p="xs"
                                    w="fit-content"
                                    h={32}
                                    sx={{
                                        borderBottomRightRadius:
                                            theme.radius.md,
                                    }}
                                >
                                    <Text fw={500} c="gray.7" lh={1.2}>
                                        {activeFilter?.values?.join(', ')}
                                    </Text>
                                </Box>
                            </>
                        )}
                    </Group>
                )}

                {filterState.dimension && !isFilterApplied && (
                    <Group spacing={0} noWrap>
                        <Select
                            w={showValuesSection ? 90 : '100%'}
                            maw={showValuesSection ? 90 : '100%'}
                            placeholder="Condition"
                            data={operatorOptions}
                            value={filterState.operator}
                            onChange={(value) =>
                                setFilterState((prev) => ({
                                    ...prev,
                                    operator: value as FilterOperator,
                                    values: showValuesSection
                                        ? prev.values
                                        : [],
                                }))
                            }
                            size="xs"
                            radius="md"
                            classNames={{
                                input: cx(
                                    operatorSelectClasses.input,
                                    isFilterApplied &&
                                        operatorSelectClasses.inputReadOnly,
                                ),
                                item: operatorSelectClasses.item,
                                dropdown: operatorSelectClasses.dropdown,
                                rightSection:
                                    operatorSelectClasses.rightSection,
                            }}
                            data-full-width={
                                !showValuesSection ? 'true' : 'false'
                            }
                            readOnly={isFilterApplied ? true : undefined}
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
                                readOnly={isFilterApplied ? true : undefined}
                            />
                        )}
                    </Group>
                )}
            </Stack>
            {mode === 'edit' && filterState.dimension && (
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
