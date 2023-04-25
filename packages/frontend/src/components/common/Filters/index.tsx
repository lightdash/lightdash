import {
    addFilterRule,
    Field,
    FilterableDimension,
    FilterRule,
    Filters,
    getFilterRulesByFieldType,
    getTotalFilterRules,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    Metric,
    TableCalculation,
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
import MantineIcon from '../MantineIcon';
import FieldAutoComplete from './FieldAutoComplete';
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
        filterRulesPerFieldType.metrics.length <= 1;
    const showMandatoryAndOperator: boolean =
        filterRulesPerFieldType.dimensions.length >= 1 &&
        filterRulesPerFieldType.metrics.length >= 1;

    const addFieldRule = useCallback(
        (field: Field | TableCalculation) => {
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
        <Stack p="lg" spacing="lg">
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
                        <Stack pos="relative">
                            {showMandatoryAndOperator && (
                                <Divider
                                    color="gray.1"
                                    orientation="vertical"
                                    sx={(theme) => ({
                                        position: 'absolute',
                                        height: 'calc(100% - 36px)',
                                        top: 36,
                                        left: `calc(${theme.spacing['4xl']} / 2)`,
                                    })}
                                />
                            )}

                            {filters.dimensions && (
                                <FilterGroupForm
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
                                <Tooltip
                                    withArrow
                                    position="top-start"
                                    label="You can only use the 'and' operator when combining metrics & dimensions"
                                >
                                    <Badge
                                        color="gray"
                                        variant="filled"
                                        w="fit-content"
                                        sx={{
                                            position: 'relative',
                                            zIndex: 1,
                                            userSelect: 'none',
                                        }}
                                    >
                                        and
                                    </Badge>
                                </Tooltip>
                            )}
                        </Stack>

                        {filters.metrics && (
                            <FilterGroupForm
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

            {isOpen && (
                <>
                    <FieldAutoComplete
                        autoFocus
                        fields={fields}
                        onChange={addFieldRule}
                        onClosed={toggleFieldInput}
                    />

                    <ActionIcon
                        size="lg"
                        variant="light"
                        color="gray"
                        onClick={toggleFieldInput}
                    >
                        <MantineIcon size="md" icon={IconX} />
                    </ActionIcon>
                </>
            )}

            {isEditMode && !isOpen && (
                <Button
                    w="fit-content"
                    size="sm"
                    variant="light"
                    disabled={fields.length <= 0}
                    leftIcon={<MantineIcon size="md" icon={IconPlus} />}
                    onClick={toggleFieldInput}
                >
                    Add filter
                </Button>
            )}
        </Stack>
    );
};

export default FiltersForm;
