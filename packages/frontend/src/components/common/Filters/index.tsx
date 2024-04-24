import {
    addFilterRule,
    getFilterRulesByFieldType,
    getFiltersFromGroup,
    getTotalFilterRules,
    hasNestedGroups,
    isAndFilterGroup,
    isField,
    isFilterableField,
    isOrFilterGroup,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type OrFilterGroup,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Stack,
    Text,
} from '@mantine/core';
import { IconAlertCircle, IconPlus, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import FilterGroupForm from './FilterGroupForm';
import {
    useFiltersContext,
    type FieldWithSuggestions,
} from './FiltersProvider';
import SimplifiedFilterGroupForm from './SimplifiedFilterGroupForm';

type Props = {
    filters: Filters;
    setFilters: (value: Filters, shouldFetchResults: boolean) => void;
    isEditMode: boolean;
};

const FiltersForm: FC<Props> = ({ filters, setFilters, isEditMode }) => {
    const { fieldsMap } = useFiltersContext();
    const [isOpen, toggleFieldInput] = useToggle(false);
    const fields = useMemo<FieldWithSuggestions[]>(() => {
        return Object.values(fieldsMap);
    }, [fieldsMap]);

    const totalFilterRules = getTotalFilterRules(filters);
    const {
        valid: validFilterRulesPerType,
        invalid: invalidFilterRulesPerType,
    } = getFilterRulesByFieldType(fields, totalFilterRules);

    const hasInvalidFilterRules = Object.values(invalidFilterRulesPerType).some(
        (arr) => arr.length > 0,
    );

    const showSimplifiedForm: boolean =
        Object.values(validFilterRulesPerType).flat().length < 2 &&
        !hasNestedGroups(filters);

    const addFieldRule = useCallback(
        (field: FieldWithSuggestions) => {
            if (isField(field) && isFilterableField(field)) {
                setFilters(addFilterRule({ filters, field }), false);
                toggleFieldInput(false);
            }
        },
        [filters, setFilters, toggleFieldInput],
    );

    const updateFieldRules = useCallback(
        (filterRules: FilterRule[]) => {
            const { valid: result } = getFilterRulesByFieldType(
                fields,
                filterRules,
            );

            setFilters(
                {
                    ...filters,
                    dimensions:
                        result.dimensions.length > 0
                            ? {
                                  id: uuidv4(),
                                  ...filters.dimensions,
                                  and: result.dimensions,
                              }
                            : undefined,
                    metrics:
                        result.metrics.length > 0
                            ? {
                                  id: uuidv4(),
                                  ...filters.metrics,
                                  and: result.metrics,
                              }
                            : undefined,
                    tableCalculations:
                        result.tableCalculations.length > 0
                            ? {
                                  id: uuidv4(),
                                  ...filters.tableCalculations,
                                  and: result.tableCalculations,
                              }
                            : undefined,
                },
                false,
            );
        },
        [fields, filters, setFilters],
    );

    const updateFiltersFromGroup = useCallback(
        (filterGroup: FilterGroup) => {
            setFilters(getFiltersFromGroup(filterGroup, fields), false);
        },
        [fields, setFilters],
    );

    const andRootFilterGroupItems = useMemo(() => {
        const dimensionAndGroupItems =
            filters.dimensions && isAndFilterGroup(filters.dimensions)
                ? filters.dimensions.and
                : [];
        const metricAndGroupItems =
            filters.metrics && isAndFilterGroup(filters.metrics)
                ? filters.metrics.and
                : [];
        const tableCalculationAndGroupItems =
            filters.tableCalculations &&
            isAndFilterGroup(filters.tableCalculations)
                ? filters.tableCalculations.and
                : [];

        return [
            ...dimensionAndGroupItems,
            ...metricAndGroupItems,
            ...tableCalculationAndGroupItems,
        ];
    }, [filters.dimensions, filters.metrics, filters.tableCalculations]);

    const orRootFilterGroups = useMemo(() => {
        const groups: OrFilterGroup[] = [];

        if (filters.dimensions && isOrFilterGroup(filters.dimensions)) {
            groups.push(filters.dimensions);
        }

        if (filters.metrics && isOrFilterGroup(filters.metrics)) {
            groups.push(filters.metrics);
        }

        if (
            filters.tableCalculations &&
            isOrFilterGroup(filters.tableCalculations)
        ) {
            groups.push(filters.tableCalculations);
        }

        return groups;
    }, [filters.dimensions, filters.metrics, filters.tableCalculations]);

    const rootFilterGroup: FilterGroup = useMemo(() => {
        // If there are no ORs, we can just return the AND group items as a new root group
        if (orRootFilterGroups.length === 0) {
            return {
                id: uuidv4(),
                and: andRootFilterGroupItems,
            };
        }

        // If there are no ANDs, we can just return the OR groups as a new root group
        if (andRootFilterGroupItems.length === 0) {
            // If there's only one OR group, we can just return it as the root group
            return orRootFilterGroups.length === 1
                ? orRootFilterGroups[0]
                : {
                      id: uuidv4(),
                      and: orRootFilterGroups,
                  };
        }

        // If there are both ANDs and ORs, we need to create a new root group that contains both
        return {
            id: uuidv4(),
            and: [...andRootFilterGroupItems, ...orRootFilterGroups],
        };
    }, [andRootFilterGroupItems, orRootFilterGroups]);

    return (
        <Stack spacing="xs" pos="relative" m="sm" style={{ flexGrow: 1 }}>
            {totalFilterRules.length >= 1 &&
                (showSimplifiedForm ? (
                    <SimplifiedFilterGroupForm
                        fields={fields}
                        isEditMode={isEditMode}
                        filterRules={getTotalFilterRules(filters)}
                        onChange={updateFieldRules}
                    />
                ) : (
                    <>
                        <Divider
                            orientation="vertical"
                            pos="absolute"
                            h="100%"
                            top={0}
                            left={18}
                            style={{ zIndex: 1 }}
                        />

                        {rootFilterGroup && (
                            <FilterGroupForm
                                hideLine
                                hideButtons
                                filterGroup={rootFilterGroup}
                                fields={fields}
                                isEditMode={isEditMode}
                                onChange={updateFiltersFromGroup}
                                onDelete={() => setFilters({}, true)}
                                allowConvertToGroup
                            />
                        )}
                    </>
                ))}

            {hasInvalidFilterRules &&
                Object.entries(invalidFilterRulesPerType).map(
                    ([type, rules], index) => (
                        <Stack
                            key={type + index}
                            ml={showSimplifiedForm ? 'none' : 'xl'}
                            spacing="two"
                            align="flex-start"
                        >
                            {rules.map((rule) => (
                                <Group
                                    key={rule.id}
                                    spacing="xs"
                                    pl="xs"
                                    sx={(theme) => ({
                                        border: `1px solid ${theme.colors.gray[2]}`,
                                        borderRadius: theme.radius.sm,
                                    })}
                                >
                                    <MantineIcon icon={IconAlertCircle} />
                                    <Text color="dimmed" fz="xs">
                                        Tried to reference field with unknown
                                        id:{' '}
                                        <Text span fw={500} c="gray.7">
                                            {rule.target.fieldId}
                                        </Text>
                                    </Text>
                                    <ActionIcon
                                        onClick={() =>
                                            updateFieldRules(
                                                getTotalFilterRules(
                                                    filters,
                                                ).filter(
                                                    ({ id }) => id !== rule.id,
                                                ),
                                            )
                                        }
                                    >
                                        <MantineIcon icon={IconX} size="sm" />
                                    </ActionIcon>
                                </Group>
                            ))}
                        </Stack>
                    ),
                )}

            {isEditMode ? (
                <Box bg="white" pos="relative" style={{ zIndex: 2 }}>
                    {!isOpen ? (
                        <Button
                            variant="outline"
                            size="xs"
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            disabled={fields.length <= 0}
                            onClick={toggleFieldInput}
                        >
                            Add filter
                        </Button>
                    ) : (
                        <FieldSelect
                            size="xs"
                            withinPortal
                            maw={300}
                            autoFocus
                            hasGrouping
                            items={fields}
                            onChange={(field) => {
                                if (!field) return;
                                addFieldRule(field);
                            }}
                            onClosed={toggleFieldInput}
                            rightSection={
                                <ActionIcon onClick={toggleFieldInput}>
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            }
                        />
                    )}
                </Box>
            ) : null}
        </Stack>
    );
};

export default FiltersForm;
