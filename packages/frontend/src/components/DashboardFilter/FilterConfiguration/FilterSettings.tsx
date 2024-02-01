import {
    DashboardFilterRule,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
} from '@lightdash/common';
import { PopoverProps, Select, Stack, Text, TextInput } from '@mantine/core';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import {
    FilterInputComponent,
    getFilterOperatorOptions,
} from '../../common/Filters/FilterInputs';
import { getPlaceholderByFilterTypeAndOperator } from '../../common/Filters/utils/getPlaceholderByFilterTypeAndOperator';

interface FilterSettingsProps {
    isEditMode: boolean;
    isCreatingNew: boolean;
    field: FilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
}

const FilterSettings: FC<FilterSettingsProps> = ({
    isEditMode,
    isCreatingNew,
    field,
    filterRule,
    popoverProps,
    onChangeFilterRule,
}) => {
    const [filterLabel, setFilterLabel] = useState<string>();

    const filterType = useMemo(() => {
        return field ? getFilterTypeFromItem(field) : FilterType.STRING;
    }, [field]);

    const filterOperatorOptions = useMemo(
        () => getFilterOperatorOptions(filterType),
        [filterType],
    );

    // Set default label when using revert (undo) button
    useEffect(() => {
        if (filterLabel !== '') {
            setFilterLabel(filterRule.label ?? field.label);
        }
    }, [filterLabel, filterRule.label, field.label]);

    const handleChangeFilterOperator = useCallback(
        (operator: FilterRule['operator']) => {
            onChangeFilterRule(
                getFilterRuleWithDefaultValue(field, {
                    ...filterRule,
                    operator,
                }),
            );
        },
        [field, filterRule, onChangeFilterRule],
    );

    const isFilterDisabled = !!filterRule.disabled;

    const showAnyValueDisabledInput =
        isFilterDisabled &&
        ![FilterOperator.NULL, FilterOperator.NOT_NULL].includes(
            filterRule.operator,
        );

    return (
        <Stack>
            <Stack spacing="xs">
                {isEditMode && (
                    <TextInput
                        label="Filter label"
                        mb="sm"
                        size="xs"
                        onChange={(e) => {
                            setFilterLabel(e.target.value);
                            onChangeFilterRule({
                                ...filterRule,
                                label: e.target.value || undefined,
                            });
                        }}
                        placeholder={`Label for ${field.label}`}
                        value={filterLabel}
                    />
                )}

                {isCreatingNew && !isEditMode && (
                    <Text size="xs" fw={500}>
                        Value
                    </Text>
                )}

                <Select
                    size="xs"
                    data={filterOperatorOptions}
                    withinPortal={popoverProps?.withinPortal}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    onChange={handleChangeFilterOperator}
                    value={filterRule.operator}
                />

                {showAnyValueDisabledInput ? (
                    <TextInput
                        disabled
                        size="xs"
                        placeholder={getPlaceholderByFilterTypeAndOperator({
                            type: filterType,
                            operator: filterRule.operator,
                            disabled: true,
                        })}
                    />
                ) : (
                    <FilterInputComponent
                        popoverProps={popoverProps}
                        filterType={filterType}
                        field={field}
                        rule={filterRule}
                        onChange={(newFilterRule) =>
                            onChangeFilterRule(
                                newFilterRule as DashboardFilterRule,
                            )
                        }
                    />
                )}
            </Stack>
        </Stack>
    );
};

export default FilterSettings;
