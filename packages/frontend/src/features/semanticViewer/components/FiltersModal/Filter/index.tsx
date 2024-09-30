import {
    assertUnreachable,
    SemanticLayerFieldType,
    SemanticLayerFilterRelativeTimeValue,
    type SemanticLayerField,
    type SemanticLayerFilter,
} from '@lightdash/common';
import {
    ActionIcon,
    Flex,
    Group,
    Menu,
    rem,
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
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import FilterButton from '../FilterButton';
import FilterFieldSelect from '../FilterFieldSelect';
import MultiStringFilter from './MultiStringFilter';
import TimeFilter from './TimeFilter';

enum AndOr {
    AND = 'and',
    OR = 'or',
}

type FilterProps = Pick<StackProps, 'style'> & {
    filter: SemanticLayerFilter;
    fields: SemanticLayerField[];
    fieldOptions: SelectItem[];
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
    // Root filter
    if (!nestedFilterProps) {
        return (
            <Flex
                justify="end"
                style={{ flexShrink: 0 }}
                w={LEFT_COMPONENT_WIDTH}
            >
                <Text size="xs" fw="bold" color="gray.6">
                    {isFirstRootFilter ? 'Where' : 'And'}
                </Text>
            </Flex>
        );
    }

    // Nested filter with nested filters
    if (nestedFilterProps && hasNestedFilters) {
        return (
            <Flex
                w={LEFT_COMPONENT_WIDTH}
                justify="end"
                style={{ flexShrink: 0 }}
            >
                <Text size="xs" fw="bold" color="gray.6">
                    {capitalize(nestedFilterProps.currentGroup)}
                </Text>
            </Flex>
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
    if (hasNestedFilters) {
        return (
            <Flex
                justify="end"
                style={{ flexShrink: 0 }}
                w={LEFT_COMPONENT_WIDTH}
            >
                <Text size="xs" fw="bold" color="gray.6">
                    Where
                </Text>
            </Flex>
        );
    }

    if (nestedFilterProps) {
        return (
            <Flex
                justify="end"
                style={{ flexShrink: 0 }}
                w={LEFT_COMPONENT_WIDTH}
            >
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
            </Flex>
        );
    }

    return null;
};

const Filter: FC<FilterProps> = ({
    filter,
    fieldOptions,
    fields,
    onDelete,
    onUpdate,
    style,
    nestedFilterProps,
    isFirstRootFilter,
}) => {
    const theme = useMantineTheme();
    const [isAddingNestedFilter, setIsAddingNestedFilter] = useState(false);

    const nestedAndFilters = useMemo(() => {
        return filter.and ?? [];
    }, [filter]);

    const nestedOrFilters = useMemo(() => {
        return filter.or ?? [];
    }, [filter]);

    const findFilterField = useCallback(
        (fieldName: string) => {
            return fields.find((f) => f.name === fieldName);
        },
        [fields],
    );

    const currentField = useMemo(() => {
        return findFilterField(filter.fieldRef);
    }, [filter.fieldRef, findFilterField]);

    // When field changes, reset operator to first available operator - this is done at the parent filter level
    const handleUpdateFilter = useCallback(
        (updatedFilter: SemanticLayerFilter) => {
            const updatedField = findFilterField(updatedFilter.fieldRef);

            if (!updatedField) {
                return;
            }

            const updatedOperator = updatedField.availableOperators.includes(
                updatedFilter.operator,
            )
                ? updatedFilter.operator
                : updatedField.availableOperators[0];

            if (!updatedOperator) {
                return;
            }

            const hasFieldTypeChanged =
                updatedField.type !== filter.fieldType ||
                updatedField.kind !== filter.fieldKind;

            if (!hasFieldTypeChanged) {
                onUpdate({
                    ...updatedFilter,
                    operator: updatedOperator,
                });
                return;
            }

            // ! reset values when field type changes

            // update field kind & type
            const baseUpdate = {
                ...updatedFilter,
                fieldKind: updatedField.kind,
                fieldType: updatedField.type,
                operator: updatedOperator,
            };

            switch (baseUpdate.fieldType) {
                case SemanticLayerFieldType.STRING:
                    onUpdate({
                        ...baseUpdate,
                        fieldType: baseUpdate.fieldType,
                        values: [],
                    });
                    return;
                case SemanticLayerFieldType.TIME:
                    onUpdate({
                        ...baseUpdate,
                        fieldType: baseUpdate.fieldType,
                        values: {
                            relativeTime:
                                SemanticLayerFilterRelativeTimeValue.TODAY,
                        },
                    });
                    return;
                case SemanticLayerFieldType.BOOLEAN:
                case SemanticLayerFieldType.NUMBER:
                    throw new Error(
                        `Filter not implement for: ${baseUpdate.fieldType}`,
                    );
                default:
                    return assertUnreachable(
                        baseUpdate.fieldType,
                        `Unknown field type: ${baseUpdate.fieldType}`,
                    );
            }
        },
        [filter.fieldKind, filter.fieldType, findFilterField, onUpdate],
    );

    const handleDeleteNestedFilter = useCallback(
        (uuid: string) => {
            const { and, or, ...filterWithoutAndOr } = filter;

            const updatedAndFilters = and?.filter((f) => f.uuid !== uuid);

            if (
                and &&
                updatedAndFilters &&
                updatedAndFilters.length < and.length
            ) {
                handleUpdateFilter({
                    ...filterWithoutAndOr,
                    ...(updatedAndFilters.length > 0
                        ? { and: updatedAndFilters }
                        : {}),
                    or,
                });
                return;
            }

            const updatedOrFilters = or?.filter((f) => f.uuid !== uuid);

            if (or && updatedOrFilters && updatedOrFilters.length < or.length) {
                handleUpdateFilter({
                    ...filterWithoutAndOr,
                    ...(updatedOrFilters.length > 0
                        ? { or: updatedOrFilters }
                        : {}),
                    and,
                });
                return;
            }
        },
        [filter, handleUpdateFilter],
    );

    const handleUpdateNestedFilter = useCallback(
        (updatedNestedFilter: SemanticLayerFilter) => {
            const isFilterInAnd = filter.and?.some(
                (f) => f.uuid === updatedNestedFilter.uuid,
            );

            if (isFilterInAnd) {
                handleUpdateFilter({
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
                handleUpdateFilter({
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
        [filter, handleUpdateFilter],
    );

    const handleAddNestedFilter = useCallback(
        (newFilter: SemanticLayerFilter) => {
            handleUpdateFilter({
                ...filter,
                and: [...(filter.and ?? []), newFilter],
            });
        },
        [filter, handleUpdateFilter],
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

            handleUpdateFilter({
                ...filterToUpdate,
                ...(updatedOrFilters.length > 0
                    ? { or: updatedOrFilters }
                    : {}),
                and: [...(filter.and ?? []), nestedFilter],
            });
        },
        [filter, handleUpdateFilter],
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

            handleUpdateFilter({
                ...filterToUpdate,
                ...(updatedAndFilters.length > 0
                    ? { and: updatedAndFilters }
                    : {}),
                or: [...(filter.or ?? []), nestedFilter],
            });
        },
        [filter, handleUpdateFilter],
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

                    {filter.fieldType === SemanticLayerFieldType.TIME ? (
                        <TimeFilter
                            fields={fields}
                            filter={filter}
                            onUpdate={handleUpdateFilter}
                            fieldOptions={fieldOptions}
                            filterField={currentField}
                        />
                    ) : filter.fieldType === SemanticLayerFieldType.STRING ? (
                        <MultiStringFilter
                            fields={fields}
                            fieldOptions={fieldOptions}
                            filter={filter}
                            onUpdate={handleUpdateFilter}
                            filterField={currentField}
                        />
                    ) : (
                        assertUnreachable(filter, 'filter type not implemented')
                    )}

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
                                fields={fields}
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
                                fields={fields}
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
                    <Group spacing="xs" w="100%" style={{ zIndex: 3 }}>
                        <FilterFieldSelect
                            fields={fields}
                            fieldOptions={fieldOptions}
                            isCreatingFilter
                            hasLeftSpacing={currentNestingLevel !== 0}
                            onCreate={(newFilter) => {
                                handleAddNestedFilter(newFilter);
                                setIsAddingNestedFilter(false);
                            }}
                            onCancel={() => setIsAddingNestedFilter(false)}
                        />
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
                        Add filter
                    </FilterButton>
                ) : null}
            </Stack>
        </Group>
    );
};

export default Filter;
