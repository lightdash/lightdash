import {
    FilterOperator,
    getFilterRuleWithDefaultValue,
    getItemId,
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
import { useCallback, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import {
    useFilterSelectStyles,
    useFilterTagInputStyles,
    useOperatorSelectStyles,
} from '../../styles/useFilterStyles';
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
    const { classes: filterSelectClasses, theme, cx } = useFilterSelectStyles();
    const { classes: operatorSelectClasses } = useOperatorSelectStyles();
    const { classes: tagInputClasses } = useFilterTagInputStyles();

    const operatorOptions = [
        {
            value: FilterOperator.EQUALS,
            label: 'is',
        },
        {
            value: FilterOperator.NOT_EQUALS,
            label: 'is not',
        },
    ];

    const [filterState, setFilterState] = useState<FilterState>({
        dimension: null,
        operator: null,
        values: [],
    });
    const [isReadMode, setIsReadMode] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterRule>();

    const handleApplyFilter = useCallback(() => {
        const dimension = dimensions?.find(
            (d) => d.name === filterState.dimension,
        );
        if (!dimension || !filterState.operator) return;
        const filterRule = getFilterRuleWithDefaultValue(
            dimension,
            {
                id: uuidv4(),
                target: {
                    fieldId: getItemId(dimension),
                },
                operator: filterState.operator,
            },
            filterState.values,
        );

        setActiveFilter(filterRule);
        setIsReadMode(true);
        onFilterApply(filterRule);
    }, [dimensions, filterState, onFilterApply]);

    const handleClearFilter = () => {
        setIsReadMode(false);
        setActiveFilter(undefined);
        setFilterState({
            dimension: null,
            operator: null,
            values: [],
        });
        onFilterApply(undefined);
    };

    const handleEditFilter = () => {
        setIsReadMode(false);
    };

    const isFilterApplied = Boolean(activeFilter && isReadMode);

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
                            visibility: filterState.dimension
                                ? 'visible'
                                : 'hidden',
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
                        }))
                    }
                    data-selected={!!filterState.dimension || isReadMode}
                    classNames={filterSelectClasses}
                    readOnly={isFilterApplied ? true : undefined}
                />

                {isFilterApplied && (
                    <Group
                        sx={{
                            border: `1px solid ${theme.colors.gray[2]}`,
                            borderRadius: theme.radius.md,
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            borderTop: 0,
                            backgroundColor: 'white',
                        }}
                        noWrap
                        spacing={0}
                    >
                        <Box
                            px="xs"
                            py="xxs"
                            bg="gray.0"
                            sx={{
                                borderBottomLeftRadius: theme.radius.md,
                            }}
                        >
                            <Text fw={550} c="dark.6">
                                {
                                    operatorOptions.find(
                                        (op) =>
                                            op.value === filterState.operator,
                                    )?.label
                                }
                            </Text>
                        </Box>
                        <Divider orientation="vertical" color="gray.2" />
                        <Box
                            px="xs"
                            py="xxs"
                            w="fit-content"
                            sx={{
                                borderBottomRightRadius: theme.radius.md,
                            }}
                        >
                            <Text fw={500} c="gray.7">
                                {activeFilter?.values?.join(', ')}
                            </Text>
                        </Box>
                    </Group>
                )}

                {filterState.dimension && !isFilterApplied && (
                    <Group spacing={0} noWrap>
                        <Select
                            placeholder="Condition"
                            data={operatorOptions}
                            value={filterState.operator}
                            onChange={(value) =>
                                setFilterState((prev) => ({
                                    ...prev,
                                    operator: value as FilterOperator,
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
                            readOnly={isFilterApplied ? true : undefined}
                        />
                        <>
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
                        </>
                    </Group>
                )}
            </Stack>
            {!isFilterApplied && (
                <Button
                    color="dark"
                    compact
                    size="xs"
                    disabled={
                        !filterState.dimension ||
                        !filterState.operator ||
                        filterState.values.length === 0
                    }
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
