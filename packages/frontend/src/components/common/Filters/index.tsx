import {
    addFilterRule,
    deleteFilterRuleFromGroup,
    getFilterGroupItemsPropertyName,
    getFiltersFromGroup,
    getItemId,
    getItemsFromFilterGroup,
    getTotalFilterRules,
    hasNestedGroups,
    isAndFilterGroup,
    isCustomSqlDimension,
    isDimension,
    isFilterableField,
    isOrFilterGroup,
    isTableCalculation,
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
    Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconPlus, IconX } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';
import {
    type FieldWithSuggestions,
    type FieldsWithSuggestions,
} from '../../Explorer/FiltersCard/useFieldsWithSuggestions';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import { FILTER_SELECT_LIMIT } from './constants';
import FilterGroupForm from './FilterGroupForm';
import SimplifiedFilterGroupForm from './SimplifiedFilterGroupForm';
import useFiltersContext from './useFiltersContext';

type Props = {
    filters: Filters;
    setFilters: (value: Filters) => void;
    isEditMode: boolean;
    useSimplifiedForm?: boolean;
};

const getInvalidFilterRules = (
    fields: FieldWithSuggestions[],
    filterRules: FilterRule[],
    getFieldId: (field: FieldWithSuggestions) => string,
) =>
    filterRules.reduce<FilterRule[]>((accumulator, filterRule) => {
        const fieldInRule = fields.find(
            (field) => getFieldId(field) === filterRule.target.fieldId,
        );

        if (!fieldInRule) {
            return [...accumulator, filterRule];
        }

        return accumulator;
    }, []);

const FiltersForm: FC<Props> = memo(
    ({ filters, setFilters, isEditMode, useSimplifiedForm = true }) => {
        // const theme = useMantineTheme();
        const { itemsMap, baseTable, getFieldId, createFilterRule } =
            useFiltersContext<FieldsWithSuggestions>();
        const [isOpen, toggleFieldInput] = useToggle(false);
        const fields = useMemo<FieldWithSuggestions[]>(() => {
            return Object.values(itemsMap);
        }, [itemsMap]);

        const totalFilterRules = getTotalFilterRules(filters);
        const clearAllFilters = useCallback(() => {
            setFilters({});
        }, [setFilters]);
        const invalidFilterRules = getInvalidFilterRules(
            fields,
            totalFilterRules,
            getFieldId ?? getItemId,
        );
        const hasInvalidFilterRules = invalidFilterRules.length > 0;

        const showSimplifiedForm: boolean =
            useSimplifiedForm &&
            totalFilterRules.length < 2 &&
            !hasNestedGroups(filters);

        const addFieldRule = useCallback(
            (field: FieldWithSuggestions) => {
                if (!isFilterableField(field)) return;
                if (!createFilterRule) {
                    setFilters(addFilterRule({ filters, field }));
                    toggleFieldInput(false);
                    return;
                }

                const groupKey = ((f: FieldWithSuggestions): keyof Filters => {
                    if (isDimension(f) || isCustomSqlDimension(f)) {
                        return 'dimensions';
                    }
                    if (isTableCalculation(f)) {
                        return 'tableCalculations';
                    }
                    return 'metrics';
                })(field);
                const group = filters[groupKey];
                const rule = createFilterRule(field);
                setFilters({
                    ...filters,
                    [groupKey]: {
                        id: uuidv4(),
                        ...group,
                        [getFilterGroupItemsPropertyName(group)]: [
                            ...getItemsFromFilterGroup(group),
                            rule,
                        ],
                    },
                });
                toggleFieldInput(false);
            },
            [createFilterRule, filters, setFilters, toggleFieldInput],
        );

        const updateFiltersFromGroup = useCallback(
            (filterGroup: FilterGroup) => {
                setFilters(
                    getFiltersFromGroup(
                        filterGroup,
                        fields,
                        getFieldId ?? getItemId,
                    ),
                );
            },
            [fields, getFieldId, setFilters],
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
                            onChange={(filterRules) => {
                                // This is a simplified form that only shows up with 1 filter rule, so we can just create a new root group
                                updateFiltersFromGroup({
                                    id: uuidv4(),
                                    and: filterRules,
                                });
                            }}
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
                                    onDelete={() => setFilters({})}
                                />
                            )}
                        </>
                    ))}

                {hasInvalidFilterRules &&
                    invalidFilterRules.map((rule, index) => (
                        <Stack
                            key={index}
                            ml={showSimplifiedForm ? 'none' : 'xl'}
                            spacing="two"
                            align="flex-start"
                        >
                            <Group
                                key={rule.id}
                                spacing="xs"
                                pl="xs"
                                sx={(theme) => ({
                                    border: `1px solid ${theme.colors.ldGray[2]}`,
                                    borderRadius: theme.radius.sm,
                                })}
                            >
                                <MantineIcon icon={IconAlertCircle} />
                                <Text color="dimmed" fz="xs">
                                    Tried to reference field with unknown id:{' '}
                                    <Text span fw={500} c="ldGray.7">
                                        {rule.target.fieldId}
                                    </Text>
                                </Text>
                                <ActionIcon
                                    onClick={() =>
                                        updateFiltersFromGroup(
                                            deleteFilterRuleFromGroup(
                                                rootFilterGroup,
                                                rule.id,
                                            ),
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconX} size="sm" />
                                </ActionIcon>
                            </Group>
                        </Stack>
                    ))}

                {isEditMode && (
                    <Box
                        pos="relative"
                        sx={(theme) => ({
                            zIndex: 2,
                            backgroundColor:
                                theme.colorScheme === 'dark'
                                    ? theme.colors.dark[6]
                                    : 'white',
                        })}
                    >
                        {!isOpen ? (
                            <Group
                                align="center"
                                position="apart"
                                sx={{ flex: 1 }}
                            >
                                <Button
                                    variant="outline"
                                    size="xs"
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    disabled={fields.length <= 0}
                                    onClick={toggleFieldInput}
                                    data-testid="FiltersForm/add-filter-button"
                                >
                                    Add filter
                                </Button>
                                {totalFilterRules.length > 0 && (
                                    <Tooltip
                                        label="Clear all filters"
                                        position="bottom"
                                    >
                                        <Button
                                            variant="light"
                                            size="xs"
                                            color="gray"
                                            onClick={clearAllFilters}
                                            disabled={
                                                totalFilterRules.length === 0
                                            }
                                        >
                                            Clear all
                                        </Button>
                                    </Tooltip>
                                )}
                            </Group>
                        ) : (
                            <FieldSelect
                                limit={FILTER_SELECT_LIMIT}
                                size="xs"
                                withinPortal
                                maw={300}
                                autoFocus
                                hasGrouping
                                baseTable={baseTable}
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
                )}
            </Stack>
        );
    },
);

FiltersForm.displayName = 'FiltersForm';

export default FiltersForm;
