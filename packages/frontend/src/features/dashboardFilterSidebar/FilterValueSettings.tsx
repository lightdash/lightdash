import {
    type FilterOperator,
    FilterType,
    getFilterRuleWithDefaultValue,
    isRelativeDateFilterOperator,
    isWithValueFilter,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterRule,
} from '@lightdash/common';
import { Box, Select, Stack, Switch, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import FilterInputComponent from '../../components/common/Filters/FilterInputs';
import { getFilterOperatorOptions } from '../../components/common/Filters/FilterInputs/utils';
import FilterOperatorOption from '../../components/common/Filters/FilterOperatorOption';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';

type Props = {
    filterType: FilterType;
    field: DashboardFilterableField | null;
    filterRule: DashboardFilterRule;
    onChange: (next: DashboardFilterRule) => void;
};

// Operator and default value, as in the shipped FilterSettings minus the label
export const FilterValueSettings: FC<Props> = ({
    filterType,
    field,
    filterRule,
    onChange,
}) => {
    const getUiString = useUiStrings();
    const item = field ?? undefined;
    const operatorOptions = useMemo(
        () => getFilterOperatorOptions(filterType, item, getUiString),
        [filterType, item, getUiString],
    );
    const isDisabled = !!filterRule.disabled;
    const hasRequirement =
        !!filterRule.required || !!filterRule.requiredGroupId;

    const handleOperator = (operator: FilterRule['operator']) => {
        // Absolute dates are already normalized; defaults could shift timezones
        const keepValues =
            filterType === FilterType.DATE &&
            (filterRule.values?.length ?? 0) > 0 &&
            isWithValueFilter(filterRule.operator) &&
            isWithValueFilter(operator) &&
            !isRelativeDateFilterOperator(filterRule.operator) &&
            !isRelativeDateFilterOperator(operator);
        onChange(
            keepValues
                ? { ...filterRule, operator, settings: undefined }
                : getFilterRuleWithDefaultValue(filterType, item, {
                      ...filterRule,
                      operator,
                  }),
        );
    };

    const handleDefaultToggle = (checked: boolean) => {
        const next: DashboardFilterRule = {
            ...filterRule,
            disabled: !checked,
            required:
                filterRule.required && !checked ? false : filterRule.required,
            requiredGroupId: undefined,
        };
        onChange(
            checked
                ? next
                : getFilterRuleWithDefaultValue(filterType, item, next, null),
        );
    };

    return (
        <Stack gap="xs">
            {!hasRequirement && (
                <Box w="max-content">
                    <Switch
                        size="xs"
                        label="Provide default value"
                        checked={!isDisabled}
                        onChange={(e) =>
                            handleDefaultToggle(e.currentTarget.checked)
                        }
                    />
                </Box>
            )}
            {(!isDisabled || hasRequirement) && (
                <>
                    <Select
                        aria-label="Operator"
                        allowDeselect={false}
                        size="xs"
                        data={operatorOptions}
                        value={filterRule.operator}
                        onChange={(value) =>
                            value &&
                            handleOperator(value as FilterRule['operator'])
                        }
                        renderOption={({ option }) => (
                            <FilterOperatorOption
                                operator={option.value as FilterOperator}
                                label={option.label}
                            />
                        )}
                    />
                    {(!isDisabled || hasRequirement) && (
                        <FilterInputComponent
                            filterType={filterType}
                            field={item}
                            rule={filterRule}
                            onChange={(next) =>
                                onChange(next as DashboardFilterRule)
                            }
                        />
                    )}
                    {hasRequirement && (filterRule.values ?? []).length > 0 && (
                        <Text size="xs" c="ldGray.7">
                            Temporary filter values for required filters will be
                            removed on dashboard save
                        </Text>
                    )}
                </>
            )}
        </Stack>
    );
};
