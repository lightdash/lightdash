import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconFilter, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import { useSelectStyles } from '../../styles/useSelectStyles';
import SelectItem from '../SelectItem';

type Props = {
    filters: {
        value: string;
        label: string;
    }[];
};

type FilterCondition = 'is' | 'is not';

interface FilterState {
    dimension: string | null;
    condition: FilterCondition | null;
    values: string[];
}

export const MetricExploreFilter: FC<Props> = ({ filters }) => {
    const { classes, theme } = useSelectStyles();

    const [filterState, setFilterState] = useState<FilterState>({
        dimension: null,
        condition: null,
        values: [],
    });

    const onFilterChange = (value: string | null) => {
        // TODO: Implement filter change
        console.log(value);

        if (value === null) {
            setFilterState({
                dimension: null,
                condition: null,
                values: [],
            });
        }
    };

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
                    data={filters}
                    disabled={filters.length === 0}
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
                                      //   boxShadow: theme.shadows.subtle,
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
                                  },
                              }
                    }
                />

                {filterState.dimension && (
                    <Group spacing={0} noWrap grow>
                        <Select
                            placeholder="Condition"
                            data={[
                                { value: 'is', label: 'is' },
                                { value: 'is_not', label: 'is not' },
                            ]}
                            value={filterState.condition}
                            onChange={(value) =>
                                setFilterState((prev) => ({
                                    ...prev,
                                    condition: value as FilterCondition,
                                }))
                            }
                            size="xs"
                            radius="md"
                            w={85}
                            maw={85}
                            styles={{
                                input: {
                                    fontWeight: 500,
                                    fontSize: 14,
                                    height: 32,
                                    borderColor: theme.colors.gray[2],
                                    borderRadius: theme.radius.md,
                                    // boxShadow: theme.shadows.subtle,
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
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

                        {filterState.condition &&
                            !['empty', 'not_empty'].includes(
                                filterState.condition,
                            ) && (
                                <>
                                    <TagInput
                                        placeholder="Type values..."
                                        value={filterState.values}
                                        onChange={(values) =>
                                            setFilterState((prev) => ({
                                                ...prev,
                                                values,
                                            }))
                                        }
                                        radius="md"
                                        w={250}
                                        size="xs"
                                        styles={{
                                            wrapper: {
                                                width: 250,
                                            },
                                            tagInput: {
                                                fontWeight: 500,
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
                                            tagInputContainer: {
                                                // border: `1px solid ${theme.colors.gray[2]}`,
                                                borderColor:
                                                    theme.colors.gray[2],
                                                borderRadius: theme.radius.md,

                                                borderTopRightRadius: 0,
                                                borderTopLeftRadius: 0,
                                                borderBottomLeftRadius: 0,
                                                borderLeft: 0,
                                                borderTop: 0,
                                                fontWeight: 500,
                                                overflow: 'scroll',
                                            },

                                            input: {
                                                fontWeight: 500,
                                                fontSize: 14,
                                                height: 32,
                                                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                                color: theme.colors.dark[7],
                                                // boxShadow: theme.shadows.subtle,
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
                            )}
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
                    onClick={() => {
                        // TODO: Implement filter application
                        console.log('Apply filter:', filterState);
                    }}
                >
                    Apply
                </Button>
            )}
        </Stack>
    );
};
