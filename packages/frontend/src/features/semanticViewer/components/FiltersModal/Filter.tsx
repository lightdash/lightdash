import {
    assertUnreachable,
    type SemanticLayerField,
    type SemanticLayerFilter,
} from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Menu,
    Select,
    Stack,
    Text,
    useMantineTheme,
    type SelectItem,
    type StackProps,
} from '@mantine/core';
import { IconDots, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FilterMultiStringInput from '../../../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import AndOrSelect, { AndOr } from './AndOrSelect';
import getOperatorString from './getOperatorString';

type FilterProps = Pick<StackProps, 'style'> & {
    filter: SemanticLayerFilter;
    fieldOptions: SelectItem[];
    allFields: SemanticLayerField[];
    onDelete: () => void;
    onUpdate: (filter: SemanticLayerFilter) => void;
    nestedProps?: {
        currentGroup: AndOr;
        moveSelfInParent: (moveTo: AndOr, filterUuid: string) => void;
        bgShade: number;
    };
};

const Filter: FC<FilterProps> = ({
    filter,
    fieldOptions,
    allFields,
    onDelete,
    onUpdate,
    style,
    nestedProps,
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

    console.log(nestedProps?.bgShade);

    const currBgShade = Math.min(nestedProps?.bgShade ?? 0, 4);

    return (
        <Stack
            w="100%"
            spacing="sm"
            style={{
                ...style,
                borderRadius: theme.radius.md,
                border: `2px solid ${theme.colors.gray[5]}`,
                backgroundColor: theme.colors.gray[currBgShade],
            }}
            p="sm"
        >
            <Group spacing="xs" w="100%" style={{ zIndex: 3 }} noWrap>
                {nestedProps ? (
                    <AndOrSelect
                        size="xs"
                        value={nestedProps.currentGroup}
                        onChange={(moveTo) => {
                            nestedProps.moveSelfInParent?.(moveTo, filter.uuid);
                        }}
                        w={70}
                    />
                ) : (
                    <Text size="xs" fw="bold" color={theme.colors.gray[6]}>
                        Where
                    </Text>
                )}
                <Select
                    size="xs"
                    withinPortal
                    style={{ flex: 2 }}
                    data={fieldOptions}
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
                    withinPortal
                    style={{ flex: 1 }}
                    data={operatorsOpts ?? []}
                    value={currentOperator}
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
                    style={{ flex: 2 }}
                    values={filter.values}
                    onChange={(values) => {
                        onUpdate({ ...filter, values });
                    }}
                />
                <ActionIcon
                    size="xs"
                    onClick={() => {
                        setIsAddingNestedFilter(true);
                    }}
                    disabled={isAddingNestedFilter}
                >
                    <IconPlus />
                </ActionIcon>
                <Menu withinPortal={true}>
                    <Menu.Target>
                        <ActionIcon size="xs">
                            <IconDots />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Divider />
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
                <Stack spacing="xs" pl="5xl">
                    {nestedAndFilters.map((nestedFilter) => (
                        <Filter
                            key={nestedFilter.uuid}
                            filter={nestedFilter}
                            fieldOptions={fieldOptions}
                            allFields={allFields}
                            nestedProps={{
                                currentGroup: AndOr.AND,
                                moveSelfInParent: handleNestedFilterMove,
                                bgShade: currBgShade + 2,
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
                            nestedProps={{
                                currentGroup: AndOr.OR,
                                moveSelfInParent: handleNestedFilterMove,
                                bgShade: currBgShade + 2,
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
        </Stack>
    );
};

export default Filter;
