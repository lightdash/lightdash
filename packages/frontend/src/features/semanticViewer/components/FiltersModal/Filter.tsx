import {
    assertUnreachable,
    type SemanticLayerField,
    type SemanticLayerFilter,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Menu,
    rem,
    Select,
    Stack,
    Text,
    useMantineTheme,
    type SelectItem,
    type StackProps,
} from '@mantine/core';
import {
    IconDots,
    IconPlus,
    IconRefresh,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FilterMultiStringInput from '../../../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import FilterButton from './FilterButton';
import FilterFieldSelectItem from './FilterFieldSelectItem';
import getOperatorString from './getOperatorString';

enum AndOr {
    AND = 'and',
    OR = 'or',
}

type FilterProps = Pick<StackProps, 'style'> & {
    filter: SemanticLayerFilter;
    fieldOptions: SelectItem[];
    allFields: SemanticLayerField[];
    onDelete: () => void;
    onUpdate: (filter: SemanticLayerFilter) => void;
    nestedFilterProps?: {
        currentGroup: AndOr;
        moveSelfInParent: (moveTo: AndOr, filterUuid: string) => void;
        nestingLevel: number;
    };
    isFirstRootFilter?: boolean;
};

const LEFT_COMPONENT_WIDTH = rem(44);

type GroupLeftProps = {
    nestedFilterProps: { currentGroup: AndOr } | undefined;
    hasNestedFilters: boolean;
    isFirstRootFilter: boolean | undefined;
};

const GroupLeft: FC<GroupLeftProps> = ({
    nestedFilterProps,
    hasNestedFilters,
    isFirstRootFilter,
}) => {
    const theme = useMantineTheme();

    // Root filter
    if (!nestedFilterProps) {
        return (
            <Box w={LEFT_COMPONENT_WIDTH} style={{ flexShrink: 0 }}>
                <Text size="xs" fw="bold" color={theme.colors.gray[6]}>
                    {isFirstRootFilter ? 'Where' : 'And'}
                </Text>
            </Box>
        );
    }

    // Nested filter with nested filters
    if (nestedFilterProps && hasNestedFilters) {
        return (
            <Box w={LEFT_COMPONENT_WIDTH} style={{ flexShrink: 0 }}>
                <Text size="xs" fw="bold" color={theme.colors.gray[6]}>
                    {capitalize(nestedFilterProps.currentGroup)}
                </Text>
            </Box>
        );
    }

    return null;
};

type FilterLeftProps = {
    filter: SemanticLayerFilter;
    nestedFilterProps: FilterProps['nestedFilterProps'];
    hasNestedFilters: boolean;
};

const FilterLeft: FC<FilterLeftProps> = ({
    filter,
    nestedFilterProps,
    hasNestedFilters,
}) => {
    const theme = useMantineTheme();

    if (hasNestedFilters) {
        return (
            <Box w={LEFT_COMPONENT_WIDTH} style={{ flexShrink: 0 }}>
                <Text size="xs" fw="bold" color={theme.colors.gray[6]}>
                    Where
                </Text>
            </Box>
        );
    }

    if (nestedFilterProps) {
        return (
            <Box w={LEFT_COMPONENT_WIDTH} style={{ flexShrink: 0 }}>
                <FilterButton
                    icon={IconRefresh}
                    onClick={() => {
                        nestedFilterProps.moveSelfInParent(
                            nestedFilterProps.currentGroup === AndOr.AND
                                ? AndOr.OR
                                : AndOr.AND,
                            filter.uuid,
                        );
                    }}
                >
                    {capitalize(nestedFilterProps.currentGroup)}
                </FilterButton>
            </Box>
        );
    }

    return null;
};

const Filter: FC<FilterProps> = ({
    filter,
    fieldOptions,
    allFields,
    onDelete,
    onUpdate,
    style,
    nestedFilterProps,
    isFirstRootFilter,
}) => {
    const { showToastError } = useToaster();
    const theme = useMantineTheme();

    const currentField = useMemo(() => {
        return allFields.find((f) => f.name === filter.field);
    }, [allFields, filter.field]);

    // When field changes, reset operator to first available operator
    const currentOperator = useMemo(() => {
        return currentField?.availableOperators.includes(filter.operator)
            ? filter.operator
            : currentField?.availableOperators[0];
    }, [currentField, filter.operator]);

    const operatorsOpts = useMemo(() => {
        return currentField?.availableOperators.map((operator) => ({
            value: operator,
            label: getOperatorString(operator),
        }));
    }, [currentField]);

    const [isAddingNestedFilter, setIsAddingNestedFilter] = useState(false);

    const nestedAndFilters = useMemo(() => {
        return filter.and ?? [];
    }, [filter]);

    const nestedOrFilters = useMemo(() => {
        return filter.or ?? [];
    }, [filter]);

    const handleDeleteNestedFilter = useCallback(
        (uuid: string) => {
            const { and, or, ...filterToUpdate } = filter;

            const updatedAndFilters = and?.filter((f) => f.uuid !== uuid);

            if (
                and &&
                updatedAndFilters &&
                updatedAndFilters.length < and.length
            ) {
                onUpdate({
                    ...filterToUpdate,
                    ...(updatedAndFilters.length > 0
                        ? { and: updatedAndFilters }
                        : {}),
                    or,
                });
                return;
            }

            const updatedOrFilters = or?.filter((f) => f.uuid !== uuid);

            if (or && updatedOrFilters && updatedOrFilters.length < or.length) {
                onUpdate({
                    ...filterToUpdate,
                    ...(updatedOrFilters.length > 0
                        ? { or: updatedOrFilters }
                        : {}),
                    and,
                });
                return;
            }
        },
        [filter, onUpdate],
    );

    const handleUpdateNestedFilter = useCallback(
        (updatedNestedFilter: SemanticLayerFilter) => {
            const isFilterInAnd = filter.and?.some(
                (f) => f.uuid === updatedNestedFilter.uuid,
            );

            if (isFilterInAnd) {
                onUpdate({
                    ...filter,
                    and: filter.and?.map((f) =>
                        f.uuid === updatedNestedFilter.uuid
                            ? updatedNestedFilter
                            : f,
                    ),
                });

                return;
            }

            const isFilterInOr = filter.or?.some(
                (f) => f.uuid === updatedNestedFilter.uuid,
            );

            if (isFilterInOr) {
                onUpdate({
                    ...filter,
                    or: filter.or?.map((f) =>
                        f.uuid === updatedNestedFilter.uuid
                            ? updatedNestedFilter
                            : f,
                    ),
                });

                return;
            }
        },
        [filter, onUpdate],
    );

    const handleAddNestedFilter = useCallback(
        (fieldName: string) => {
            const field = allFields?.find((f) => f.name === fieldName);

            if (!field) {
                showToastError({
                    title: 'Error',
                    subtitle: 'Field not found',
                });
                return;
            }

            const defaultOperator = field.availableOperators[0];

            if (!defaultOperator) {
                showToastError({
                    title: 'Error',
                    subtitle: 'No filter operators available for this field',
                });
                return;
            }

            const newFilter: SemanticLayerFilter = {
                uuid: uuidv4(),
                field: fieldName,
                fieldKind: field.kind,
                fieldType: field.type,
                operator: defaultOperator,
                values: [],
            };

            // be default add to and
            onUpdate({ ...filter, and: [...(filter.and ?? []), newFilter] });
        },
        [allFields, filter, onUpdate, showToastError],
    );

    const handleMoveFilterToAnd = useCallback(
        (uuid: string) => {
            const { and, or, ...filterToUpdate } = filter;

            if (and) {
                // check if filter is already in and
                const nestedFilter = and.find((f) => f.uuid === uuid);
                if (nestedFilter) {
                    return;
                }
            }

            const nestedFilter = or?.find((f) => f.uuid === uuid);

            if (!nestedFilter) {
                return;
            }

            const updatedOrFilters = or?.filter((f) => f.uuid !== uuid) ?? [];

            onUpdate({
                ...filterToUpdate,
                ...(updatedOrFilters.length > 0
                    ? { or: updatedOrFilters }
                    : {}),
                and: [...(filter.and ?? []), nestedFilter],
            });
        },
        [filter, onUpdate],
    );

    const handleMoveFilterToOr = useCallback(
        (uuid: string) => {
            const { and, or, ...filterToUpdate } = filter;

            if (or) {
                // check if filter is already in or
                const nestedFilter = or.find((f) => f.uuid === uuid);
                if (nestedFilter) {
                    return;
                }
            }

            const nestedFilter = and?.find((f) => f.uuid === uuid);

            if (!nestedFilter) {
                return;
            }

            const updatedAndFilters = and?.filter((f) => f.uuid !== uuid) ?? [];

            onUpdate({
                ...filterToUpdate,
                ...(updatedAndFilters.length > 0
                    ? { and: updatedAndFilters }
                    : {}),
                or: [...(filter.or ?? []), nestedFilter],
            });
        },
        [filter, onUpdate],
    );

    // This is used to move a filter within its parent group (passed down as props by parent filter to nested filters)
    const handleNestedFilterMove = useCallback(
        (moveTo: AndOr, uuid: string) => {
            switch (moveTo) {
                case AndOr.AND:
                    handleMoveFilterToAnd(uuid);
                    break;
                case AndOr.OR:
                    handleMoveFilterToOr(uuid);
                    break;
                default:
                    assertUnreachable(moveTo, `Invalid move: ${moveTo}`);
            }
        },
        [handleMoveFilterToAnd, handleMoveFilterToOr],
    );

    const hasNestedFilters = useMemo(() => {
        return nestedAndFilters.length > 0 || nestedOrFilters.length > 0;
    }, [nestedAndFilters, nestedOrFilters]);

    const currentNestingLevel = useMemo(() => {
        return nestedFilterProps?.nestingLevel ?? 0;
    }, [nestedFilterProps]);

    const currBgShade = useMemo(
        () => Math.min(currentNestingLevel, 1),
        [currentNestingLevel],
    );

    return (
        <Group w="100%" spacing="xs" align="center" noWrap>
            <GroupLeft
                nestedFilterProps={nestedFilterProps}
                hasNestedFilters={hasNestedFilters}
                isFirstRootFilter={isFirstRootFilter}
            />

            <Stack
                w="100%"
                spacing="xs"
                align="flex-start"
                style={{
                    ...style,
                    borderRadius: theme.radius.md,
                    ...(hasNestedFilters && {
                        border: `1px solid ${
                            theme.colors.gray[currBgShade + 2]
                        }`,
                        backgroundColor: theme.colors.gray[currBgShade],
                    }),
                }}
                p={hasNestedFilters ? 'sm' : undefined}
            >
                <Group spacing="xs" w="100%" align="center" noWrap>
                    <FilterLeft
                        filter={filter}
                        nestedFilterProps={nestedFilterProps}
                        hasNestedFilters={hasNestedFilters}
                    />

                    <Select
                        size="xs"
                        withinPortal
                        style={{ flex: 5 }}
                        data={fieldOptions}
                        itemComponent={FilterFieldSelectItem}
                        value={filter.field}
                        onChange={(value) => {
                            if (!value) {
                                return;
                            }

                            onUpdate({ ...filter, field: value });
                        }}
                    />

                    <Select
                        size="xs"
                        w={75}
                        withinPortal
                        data={operatorsOpts ?? []}
                        value={currentOperator}
                        portalProps={{
                            color: 'red',
                        }}
                        onChange={(
                            value: SemanticLayerFilter['operator'] | null,
                        ) => {
                            if (!value) {
                                return;
                            }

                            onUpdate({ ...filter, operator: value });
                        }}
                    />

                    <FilterMultiStringInput
                        size="xs"
                        withinPortal
                        style={{ flex: 5 }}
                        values={filter.values}
                        onChange={(values) => {
                            onUpdate({ ...filter, values });
                        }}
                    />

                    <Menu withinPortal withArrow shadow="md">
                        <Menu.Target>
                            <ActionIcon size="xs">
                                <IconDots />
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                            {!hasNestedFilters && (
                                <>
                                    <Menu.Label>Filter actions</Menu.Label>
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconPlus} />}
                                        disabled={isAddingNestedFilter}
                                        onClick={() => {
                                            setIsAddingNestedFilter(true);
                                        }}
                                    >
                                        Add nested filter
                                    </Menu.Item>
                                    <Menu.Divider />
                                </>
                            )}
                            <Menu.Item
                                color="red"
                                icon={<IconTrash size={14} />}
                                onClick={onDelete}
                            >
                                Delete filter
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>

                {hasNestedFilters && (
                    <Stack spacing="xs" pl="2xl" w="100%">
                        {nestedAndFilters.map((nestedFilter) => (
                            <Filter
                                key={nestedFilter.uuid}
                                filter={nestedFilter}
                                fieldOptions={fieldOptions}
                                allFields={allFields}
                                nestedFilterProps={{
                                    currentGroup: AndOr.AND,
                                    moveSelfInParent: handleNestedFilterMove,
                                    nestingLevel: currentNestingLevel + 1,
                                }}
                                onUpdate={handleUpdateNestedFilter}
                                onDelete={() =>
                                    handleDeleteNestedFilter(nestedFilter.uuid)
                                }
                            />
                        ))}

                        {nestedOrFilters.map((nestedFilter) => (
                            <Filter
                                key={nestedFilter.uuid}
                                filter={nestedFilter}
                                fieldOptions={fieldOptions}
                                allFields={allFields}
                                nestedFilterProps={{
                                    currentGroup: AndOr.OR,
                                    moveSelfInParent: handleNestedFilterMove,
                                    nestingLevel: currentNestingLevel + 1,
                                }}
                                onUpdate={handleUpdateNestedFilter}
                                onDelete={() =>
                                    handleDeleteNestedFilter(nestedFilter.uuid)
                                }
                            />
                        ))}
                    </Stack>
                )}

                {isAddingNestedFilter && (
                    <Group spacing="xs" style={{ zIndex: 3 }}>
                        <Select
                            size="xs"
                            data={fieldOptions}
                            placeholder="Select field"
                            searchable
                            withinPortal={true}
                            onChange={(value) => {
                                setIsAddingNestedFilter(false);

                                if (!value) {
                                    return;
                                }

                                handleAddNestedFilter(value);
                            }}
                        />
                        <ActionIcon
                            size="xs"
                            onClick={() => setIsAddingNestedFilter(false)}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Group>
                )}

                {hasNestedFilters ? (
                    <FilterButton
                        icon={IconPlus}
                        onClick={() => {
                            setIsAddingNestedFilter(true);
                        }}
                        disabled={isAddingNestedFilter}
                    >
                        Add nested filter
                    </FilterButton>
                ) : null}
            </Stack>
        </Group>
    );
};

export default Filter;
