import {
    addFilterRule,
    FilterableDimension,
    FilterRule,
    Filters,
    getFilterRulesByFieldType,
    getTotalFilterRules,
    hasNestedGroups,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    Metric,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Divider,
    Stack,
    Tooltip,
} from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import FilterGroupForm from './FilterGroupForm';
import { FieldWithSuggestions, useFiltersContext } from './FiltersProvider';
import SimplifiedFilterGroupForm from './SimplifiedFilterGroupForm';

type Props = {
    filters: Filters;
    setFilters: (value: Filters, shouldFetchResults: boolean) => void;
    isEditMode: boolean;
};

const FiltersForm: FC<Props> = ({ filters, setFilters, isEditMode }) => {
    const { fieldsMap } = useFiltersContext();
    const [isOpen, toggleFieldInput] = useToggle(false);
    const [fields, dimensions, metrics] = useMemo<
        [FieldWithSuggestions[], FilterableDimension[], Metric[]]
    >(() => {
        const allFields = Object.values(fieldsMap);
        return [
            allFields,
            allFields.filter(isDimension),
            allFields.filter(isMetric),
        ];
    }, [fieldsMap]);

    const totalFilterRules = getTotalFilterRules(filters);
    const filterRulesPerFieldType = getFilterRulesByFieldType(
        fields,
        totalFilterRules,
    );
    const showSimplifiedForm: boolean =
        filterRulesPerFieldType.dimensions.length <= 1 &&
        filterRulesPerFieldType.metrics.length <= 1 &&
        !hasNestedGroups(filters);
    const showMandatoryAndOperator: boolean =
        filterRulesPerFieldType.dimensions.length >= 1 &&
        filterRulesPerFieldType.metrics.length >= 1;

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
            const result = getFilterRulesByFieldType(fields, filterRules);

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
                },
                false,
            );
        },
        [fields, filters, setFilters],
    );
    return (
        <Stack pos="relative" m="sm" style={{ flexGrow: 1 }}>
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

                        {filters.dimensions &&
                            filterRulesPerFieldType.dimensions.length >= 1 && (
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
                            filterRulesPerFieldType.metrics.length >= 1 && (
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
                    </>
                ))}

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
