import {
    FilterOperator,
    FilterType,
    getFilterRuleWithDefaultValue,
    isRelativeDateFilterOperator,
    isWithValueFilter,
    supportsSingleValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import FilterInputComponent from '../../components/common/Filters/FilterInputs';
import { getFilterOperatorOptions } from '../../components/common/Filters/FilterInputs/utils';
import FilterOperatorOption from '../../components/common/Filters/FilterOperatorOption';
import { getPlaceholderByFilterTypeAndOperator } from '../../components/common/Filters/utils/getPlaceholderByFilterTypeAndOperator';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';
import classes from './FilterValueSettings.module.css';
import { isDefaultValueIncomplete } from './sidebarState';

type Props = {
    filterType: FilterType;
    field: DashboardFilterableField | null;
    filterRule: DashboardFilterRule;
    onChange: (next: DashboardFilterRule) => void;
};

const hasRequirement = (rule: DashboardFilterRule) =>
    !!rule.required || !!rule.requiredGroupId;

// What the shipped popover does to every edit: a value switches the default
// on, and a required filter with no value is off
const withShippedDisabledState = (
    rule: DashboardFilterRule,
): DashboardFilterRule => {
    const hasValue = !!hasFilterValueSet(rule);
    return {
        ...rule,
        disabled:
            (!!rule.disabled && !hasValue) ||
            (hasRequirement(rule) && !hasValue),
    };
};

// Operator, single or multiple values and default value, as in the shipped
// FilterSettings minus the label
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
    const isRequired = hasRequirement(filterRule);
    const isMissingValue = isDefaultValueIncomplete(filterRule);
    const hasValueCount = supportsSingleValue(filterType, filterRule.operator);
    const showAnyValue =
        isDisabled &&
        !isRequired &&
        ![FilterOperator.NULL, FilterOperator.NOT_NULL].includes(
            filterRule.operator,
        );

    const emit = (next: DashboardFilterRule) =>
        onChange(withShippedDisabledState(next));

    const handleOperator = (operator: FilterRule['operator']) => {
        // Absolute dates are already normalized; defaults could shift timezones
        const keepValues =
            filterType === FilterType.DATE &&
            (filterRule.values?.length ?? 0) > 0 &&
            isWithValueFilter(filterRule.operator) &&
            isWithValueFilter(operator) &&
            !isRelativeDateFilterOperator(filterRule.operator) &&
            !isRelativeDateFilterOperator(operator);
        emit(
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
        emit(
            checked
                ? next
                : getFilterRuleWithDefaultValue(filterType, item, next, null),
        );
    };

    return (
        <Stack gap="xs">
            <Select
                aria-label="Operator"
                allowDeselect={false}
                size="xs"
                data={operatorOptions}
                value={filterRule.operator}
                onChange={(value) =>
                    value && handleOperator(value as FilterRule['operator'])
                }
                renderOption={({ option }) => (
                    <FilterOperatorOption
                        operator={option.value as FilterOperator}
                        label={option.label}
                    />
                )}
                classNames={
                    hasValueCount
                        ? { section: classes.valueCountSection }
                        : undefined
                }
                rightSectionWidth={hasValueCount ? 140 : undefined}
                rightSectionPointerEvents={hasValueCount ? 'all' : undefined}
                rightSection={
                    hasValueCount && (
                        <Button
                            size="compact-xs"
                            variant="light"
                            rightSection={
                                <Tooltip
                                    label={
                                        filterRule.singleValue
                                            ? 'Prevent selection of multiple values'
                                            : 'Allow selection of multiple values'
                                    }
                                >
                                    <MantineIcon
                                        size="sm"
                                        icon={IconHelpCircle}
                                    />
                                </Tooltip>
                            }
                            onClick={() =>
                                emit({
                                    ...filterRule,
                                    singleValue: !filterRule.singleValue,
                                })
                            }
                        >
                            {filterRule.singleValue
                                ? 'Single value'
                                : 'Multiple values'}
                        </Button>
                    )
                }
            />
            {showAnyValue && (
                <TextInput
                    aria-label="Default value"
                    disabled
                    size="xs"
                    placeholder={getPlaceholderByFilterTypeAndOperator({
                        getUiString,
                        type: filterType,
                        operator: filterRule.operator,
                        disabled: true,
                    })}
                />
            )}
            {(!isDisabled || isRequired) && (
                <FilterInputComponent
                    filterType={filterType}
                    field={item}
                    rule={filterRule}
                    onChange={(next) => emit(next as DashboardFilterRule)}
                />
            )}
            {isMissingValue && (
                <Text size="xs" c="dimmed">
                    Choose a value, or the default is left off.
                </Text>
            )}
            {isRequired && (filterRule.values ?? []).length > 0 && (
                <Text size="xs" c="dimmed">
                    Temporary filter values for required filters will be removed
                    on dashboard save
                </Text>
            )}
            {!isRequired && (
                <Tooltip
                    position="right"
                    label={
                        isDisabled
                            ? 'Toggle on to set a default filter value'
                            : 'Toggle off to leave the filter value empty, allowing users to populate it in view mode'
                    }
                    openDelay={500}
                >
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
                </Tooltip>
            )}
            {isDisabled && !isRequired && (
                <Text size="xs" c="dimmed">
                    Not set: each tile keeps its own values until a viewer picks
                    one.
                </Text>
            )}
        </Stack>
    );
};
