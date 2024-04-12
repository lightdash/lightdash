import {
    addFilterRule,
    getFilterRulesByFieldType,
    getFiltersFromGroup,
    getTotalFilterRules,
    hasNestedGroups,
    isAndFilterGroup,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    isTableCalculationField,
    type AndFilterGroup,
    type FilterableDimension,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type Metric,
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
    const [fields] = useMemo<
        [
            FieldWithSuggestions[],
            FilterableDimension[],
            Metric[],
            FieldWithSuggestions[],
        ]
    >(() => {
        const allFields = Object.values(fieldsMap);
        return [
            allFields,
            allFields.filter(isDimension),
            allFields.filter(isMetric),
            allFields.filter(isTableCalculationField),
        ];
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
        validFilterRulesPerType.dimensions.length <= 1 &&
        validFilterRulesPerType.metrics.length <= 1 &&
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

    const andRootFilterGroups = useMemo(() => {
        const dimensionAndGroup =
            filters.dimensions && isAndFilterGroup(filters.dimensions)
                ? filters.dimensions.and
                : [];
        const metricAndGroup =
            filters.metrics && isAndFilterGroup(filters.metrics)
                ? filters.metrics.and
                : [];
        const tableCalculationAndGroup =
            filters.tableCalculations &&
            isAndFilterGroup(filters.tableCalculations)
                ? filters.tableCalculations.and
                : [];

        const and = [
            ...dimensionAndGroup,
            ...metricAndGroup,
            ...tableCalculationAndGroup,
        ];

        if (and.length === 0) {
            return;
        }

        return {
            id: uuidv4(),
            and,
        } as AndFilterGroup;
    }, [filters.dimensions, filters.metrics, filters.tableCalculations]);

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

                        {andRootFilterGroups && (
                            <FilterGroupForm
                                hideLine
                                hideButtons
                                filterGroup={andRootFilterGroups}
                                fields={fields}
                                isEditMode={isEditMode}
                                onChange={updateFiltersFromGroup}
                                onDelete={() => setFilters({}, true)}
                                conditionLabel={''}
                                allowConvertToGroup
                            />
                        )}

                        {/* {filters.dimensions &&
                            validFilterRulesPerType.dimensions.length >= 1 && (
                                <FilterGroupForm
                                    allowConvertToGroup
                                    hideLine
                                    hideButtons
                                    conditionLabel="dimension"
                                    filterGroup={filters.dimensions}
                                    fields={dimensions}
                                    isEditMode={isEditMode}
                                    onChange={(value) =>
                                        setFilters(
                                            {
                                                ...filters,
                                                dimensions: value,
                                            },
                                            false,
                                        )
                                    }
                                    onDelete={() =>
                                        setFilters(
                                            {
                                                ...filters,
                                                dimensions: undefined,
                                            },
                                            true,
                                        )
                                    }
                                />
                            )}

                        {showMandatoryAndOperator && (
                            <Box
                                bg="white"
                                pos="relative"
                                style={{ zIndex: 2 }}
                            >
                                <Tooltip label="You can only use the 'and' operator when combining metrics & dimensions">
                                    <Badge variant="light" color="gray">
                                        and
                                    </Badge>
                                </Tooltip>
                            </Box>
                        )}

                        {filters.metrics &&
                            validFilterRulesPerType.metrics.length >= 1 && (
                                <FilterGroupForm
                                    allowConvertToGroup
                                    hideLine
                                    hideButtons
                                    conditionLabel="metric"
                                    filterGroup={filters.metrics}
                                    fields={metrics}
                                    isEditMode={isEditMode}
                                    onChange={(value) =>
                                        setFilters(
                                            {
                                                ...filters,
                                                metrics: value,
                                            },
                                            false,
                                        )
                                    }
                                    onDelete={() =>
                                        setFilters(
                                            {
                                                ...filters,
                                                metrics: undefined,
                                            },
                                            true,
                                        )
                                    }
                                />
                            )}
                        {filters.tableCalculations &&
                            validFilterRulesPerType.tableCalculations.length >=
                                1 && (
                                <FilterGroupForm
                                    allowConvertToGroup
                                    hideLine
                                    hideButtons
                                    conditionLabel="table calculation"
                                    filterGroup={filters.tableCalculations}
                                    fields={tableCalculations}
                                    isEditMode={isEditMode}
                                    onChange={(value) =>
                                        setFilters(
                                            {
                                                ...filters,
                                                tableCalculations: value,
                                            },
                                            false,
                                        )
                                    }
                                    onDelete={() =>
                                        setFilters(
                                            {
                                                ...filters,
                                                tableCalculations: undefined,
                                            },
                                            true,
                                        )
                                    }
                                />
                            )} */}
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
