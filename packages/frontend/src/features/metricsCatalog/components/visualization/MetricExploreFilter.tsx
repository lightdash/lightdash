import {
    FilterOperator,
    getFilterRuleWithDefaultValue,
    getItemId,
    type CompiledDimension,
    type FilterRule,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconFilter, IconX } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import { useSelectStyles } from '../../styles/useSelectStyles';
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
    const { classes, theme } = useSelectStyles();

    const [filterState, setFilterState] = useState<FilterState>({
        dimension: null,
        operator: null,
        values: [],
    });

    const onFilterChange = (value: string | null) => {
        if (value === null) {
            setFilterState({
                dimension: null,
                operator: null,
                values: [],
            });
            onFilterApply(undefined);
        }
    };

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

        onFilterApply(filterRule);
    }, [
        dimensions,
        filterState.operator,
        filterState.dimension,
        filterState.values,
        onFilterApply,
    ]);

    return (
        <Stack spacing="xs">
            <Group position="apart">
                <Text fw={500} c="gray.7">
                    Filter
                </Text>

                <Button
                    variant="subtle"
                    compact
                    color="dark"
                    size="xs"
                    radius="md"
                    rightIcon={
                        <MantineIcon icon={IconX} color="gray.5" size={12} />
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
                    onClick={() => onFilterChange(null)}
                >
                    Clear
                </Button>
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
                    classNames={filterState.dimension ? undefined : classes}
                    styles={
                        !filterState.dimension
                            ? undefined
                            : {
                                  input: {
                                      fontWeight: 500,
                                      fontSize: 14,
                                      height: 32,
                                      borderColor: theme.colors.gray[2],
                                      borderRadius: theme.radius.md,
                                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                      color: theme.colors.dark[7],
                                      '&:hover': {
                                          backgroundColor: theme.colors.gray[0],
                                          transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                      },
                                      '&[value=""]': {
                                          border: `1px dashed ${theme.colors.gray[4]}`,
                                      },
                                      borderBottomLeftRadius: 0,
                                      borderBottomRightRadius: 0,
                                      '&:focus': {
                                          borderColor: theme.colors.gray[2],
                                      },
                                      '&:focus-within': {
                                          borderColor: theme.colors.gray[2],
                                      },
                                  },
                                  item: {
                                      fontSize: 14,
                                      '&[data-selected="true"]': {
                                          color: theme.colors.gray[7],
                                          fontWeight: 500,
                                          backgroundColor: theme.colors.gray[0],
                                      },
                                      '&[data-selected="true"]:hover': {
                                          backgroundColor: theme.colors.gray[0],
                                      },
                                      '&:hover': {
                                          backgroundColor: theme.colors.gray[0],
                                          transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                      },
                                  },
                                  dropdown: {
                                      minWidth: 300,
                                  },
                                  rightSection: {
                                      pointerEvents: 'none',
                                      paddingRight: 4,
                                  },
                              }
                    }
                />

                {filterState.dimension && (
                    <Group spacing={0} noWrap>
                        <Select
                            placeholder="Condition"
                            data={[
                                { value: FilterOperator.EQUALS, label: 'is' },
                                {
                                    value: FilterOperator.NOT_EQUALS,
                                    label: 'is not',
                                },
                            ]}
                            value={filterState.operator}
                            onChange={(value) =>
                                setFilterState((prev) => ({
                                    ...prev,
                                    operator: value as FilterOperator,
                                }))
                            }
                            size="xs"
                            radius="md"
                            w={90}
                            maw={90}
                            styles={{
                                input: {
                                    fontWeight: 500,
                                    fontSize: 14,
                                    height: 32,
                                    borderColor: theme.colors.gray[2],
                                    borderRadius: theme.radius.md,
                                    padding: `${theme.spacing.xs} ${theme.spacing.xs}`,
                                    color: theme.colors.dark[7],
                                    '&:hover': {
                                        backgroundColor: theme.colors.gray[0],
                                        transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                    },
                                    '&[value=""]': {
                                        border: `1px dashed ${theme.colors.gray[4]}`,
                                    },

                                    borderTopLeftRadius: 0,
                                    borderTopRightRadius: 0,
                                    borderBottomRightRadius: 0,
                                    paddingRight: 8,
                                    borderTop: 0,
                                    '&:focus': {
                                        borderColor: theme.colors.gray[2],
                                    },
                                    '&:focus-within': {
                                        borderColor: theme.colors.gray[2],
                                    },
                                },
                                item: {
                                    fontSize: 14,
                                    '&[data-selected="true"]': {
                                        color: theme.colors.gray[7],
                                        fontWeight: 500,
                                        backgroundColor: theme.colors.gray[0],
                                    },
                                    '&[data-selected="true"]:hover': {
                                        backgroundColor: theme.colors.gray[0],
                                    },
                                    '&:hover': {
                                        backgroundColor: theme.colors.gray[0],
                                        transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                    },
                                },
                                dropdown: {
                                    minWidth: 60,
                                },
                                rightSection: {
                                    pointerEvents: 'none',
                                },
                            }}
                        />
                        <>
                            <TagInput
                                placeholder="Type values..."
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
                                styles={{
                                    wrapper: {
                                        width: 200,
                                    },
                                    tagInput: {
                                        fontWeight: 500,
                                        fontSize: 14,
                                    },
                                    // @ts-expect-error this is a valid property
                                    tagInputEmpty: {
                                        fontWeight: 500,
                                    },
                                    value: {
                                        fontWeight: 500,
                                        borderRadius: theme.radius.sm,
                                        color: theme.colors.dark[7],
                                        border: `1px solid ${theme.colors.gray[2]}`,
                                    },
                                    values: {
                                        maxHeight: 32,
                                    },
                                    tagInputContainer: {
                                        borderColor: theme.colors.gray[2],
                                        borderRadius: theme.radius.md,

                                        borderTopRightRadius: 0,
                                        borderTopLeftRadius: 0,
                                        borderBottomLeftRadius: 0,
                                        borderLeft: 0,
                                        borderTop: 0,
                                        fontWeight: 500,
                                        overflow: 'scroll',
                                        maxHeight: 32,
                                        '&:focus': {
                                            borderColor: theme.colors.gray[2],
                                        },
                                        '&:focus-within': {
                                            borderColor: theme.colors.gray[2],
                                        },
                                    },

                                    input: {
                                        height: 32,
                                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                        color: theme.colors.dark[7],
                                        '&:hover': {
                                            backgroundColor:
                                                theme.colors.gray[0],
                                            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                        },
                                        '&[value=""]': {
                                            border: `1px dashed ${theme.colors.gray[4]}`,
                                        },
                                    },

                                    rightSection: {
                                        pointerEvents: 'none',
                                    },
                                }}
                            />
                        </>
                    </Group>
                )}
            </Stack>
            {filterState.values.length > 0 && (
                <Button
                    color="dark"
                    compact
                    size="xs"
                    ml={8}
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
