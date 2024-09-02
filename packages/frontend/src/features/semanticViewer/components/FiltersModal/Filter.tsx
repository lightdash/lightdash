import {
    type SemanticLayerField,
    type SemanticLayerFilter,
} from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Menu,
    Select,
    Stack,
    type SelectItem,
} from '@mantine/core';
import { IconDots, IconTrash, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FilterMultiStringInput from '../../../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import getOperatorString from './getOperatorString';
interface FilterProps {
    filter: SemanticLayerFilter;
    fieldOptions: SelectItem[];
    allFields: SemanticLayerField[];
    onDelete: () => void;
    onUpdate: (filter: SemanticLayerFilter) => void;
}

const Filter: FC<FilterProps> = ({
    filter,
    fieldOptions,
    allFields,
    onDelete,
    onUpdate,
}) => {
    const { showToastError } = useToaster();
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
            const updatedAndFilters = filter.and?.filter(
                (f) => f.uuid !== uuid,
            );

            if (
                updatedAndFilters?.length !== filter.and?.length &&
                (updatedAndFilters?.length ?? 0) > 0
            ) {
                onUpdate({ ...filter, and: updatedAndFilters });
                return;
            }

            const updatedOrFilters = filter.or?.filter((f) => f.uuid !== uuid);

            if (
                updatedOrFilters?.length !== filter.or?.length &&
                (updatedOrFilters?.length ?? 0) > 0
            ) {
                onUpdate({ ...filter, or: updatedOrFilters });
                return;
            }

            const { and, or, ...updatedFilter } = filter;

            onUpdate(updatedFilter);
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
        (field: string) => {
            const defaultOperator = allFields?.find((f) => f.name === field)
                ?.availableOperators[0];

            if (!defaultOperator) {
                showToastError({
                    title: 'Error',
                    subtitle: 'No filter operators available for this field',
                });
                return;
            }

            const newFilter: SemanticLayerFilter = {
                uuid: uuidv4(),
                field: field,
                operator: defaultOperator,
                values: [],
            };

            // be default add to and
            onUpdate({ ...filter, and: [newFilter] });
        },
        [allFields, filter, onUpdate, showToastError],
    );

    return (
        <Stack w="100%" spacing="xs">
            <Group spacing="xs" w="100%" style={{ zIndex: 3 }}>
                <Select
                    size="xs"
                    withinPortal={true}
                    style={{ flex: 1 }}
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
                    withinPortal={true}
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
                    style={{ flex: 1 }}
                    values={filter.values}
                    onChange={(values) => {
                        onUpdate({ ...filter, values });
                    }}
                />
                <Menu withinPortal={true}>
                    <Menu.Target>
                        <ActionIcon size="xs">
                            <IconDots color="red" />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            disabled={isAddingNestedFilter}
                            onClick={() => {
                                setIsAddingNestedFilter(true);
                            }}
                        >
                            Add nested filter
                        </Menu.Item>
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

            {(nestedAndFilters.length > 0 ||
                nestedOrFilters.length > 0 ||
                isAddingNestedFilter) && (
                <Stack spacing="xs" pl="sm" style={{ flexGrow: 1 }}>
                    {nestedAndFilters.map((nestedFilter) => (
                        <Filter
                            key={nestedFilter.uuid}
                            filter={nestedFilter}
                            fieldOptions={fieldOptions}
                            allFields={allFields}
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
                            onUpdate={handleUpdateNestedFilter}
                            onDelete={() =>
                                handleDeleteNestedFilter(nestedFilter.uuid)
                            }
                        />
                    ))}

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
            )}
        </Stack>
    );
};

export default Filter;
