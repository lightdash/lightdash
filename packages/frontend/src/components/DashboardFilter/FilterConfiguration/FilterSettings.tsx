import {
    FilterOperator,
    getFilterRuleWithDefaultValue,
    supportsSingleValue,
    type DashboardFilterRule,
    type FilterRule,
    type FilterType,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import FilterInputComponent from '../../common/Filters/FilterInputs';
import { getFilterOperatorOptions } from '../../common/Filters/FilterInputs/utils';
import { getPlaceholderByFilterTypeAndOperator } from '../../common/Filters/utils/getPlaceholderByFilterTypeAndOperator';
import MantineIcon from '../../common/MantineIcon';

interface FilterSettingsProps {
    isEditMode: boolean;
    isCreatingNew: boolean;
    filterType: FilterType;
    field?: FilterableDimension;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
}

const FilterSettings: FC<FilterSettingsProps> = ({
    isEditMode,
    isCreatingNew,
    field,
    filterType,
    filterRule,
    popoverProps,
    onChangeFilterRule,
}) => {
    const [filterLabel, setFilterLabel] = useState<string>();

    const filterOperatorOptions = useMemo(
        () => getFilterOperatorOptions(filterType),
        [filterType],
    );

    // Set default label when using revert (undo) button
    useEffect(() => {
        if (filterLabel !== '') {
            setFilterLabel(filterRule.label ?? field?.label);
        }
    }, [filterLabel, filterRule.label, field?.label]);

    const handleChangeFilterOperator = (operator: FilterRule['operator']) => {
        onChangeFilterRule(
            getFilterRuleWithDefaultValue(filterType, field, {
                ...filterRule,
                operator,
            }),
        );
    };

    const isFilterDisabled = !!filterRule.disabled;

    const showValueInput = useMemo(() => {
        // Always show the input in view mode
        if (!isEditMode) {
            return true;
        }
        // In edit mode, only don't show input when disabled
        if (isFilterDisabled) {
            return false;
        }
        return true;
    }, [isFilterDisabled, isEditMode]);

    const showAnyValueDisabledInput = useMemo(() => {
        return (
            isFilterDisabled &&
            isEditMode &&
            ![FilterOperator.NULL, FilterOperator.NOT_NULL].includes(
                filterRule.operator,
            )
        );
    }, [filterRule.operator, isFilterDisabled, isEditMode]);

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
                        placeholder={
                            field ? `Label for ${field.label}` : 'Filter label'
                        }
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
                    rightSectionWidth={140}
                    rightSectionProps={{
                        style: {
                            justifyContent: 'flex-end',
                            marginRight: '8px',
                        },
                    }}
                    rightSection={
                        supportsSingleValue(filterType, filterRule.operator) &&
                        isEditMode && (
                            <Button
                                compact
                                size="xs"
                                variant={'light'}
                                rightIcon={
                                    <Tooltip
                                        variant="xs"
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
                                onClick={() => {
                                    onChangeFilterRule({
                                        ...filterRule,
                                        singleValue: !filterRule.singleValue,
                                    });
                                }}
                            >
                                {filterRule.singleValue
                                    ? 'Single value'
                                    : 'Multiple values'}
                            </Button>
                        )
                    }
                />
                {showAnyValueDisabledInput && !filterRule.required && (
                    <TextInput
                        disabled
                        size="xs"
                        placeholder={getPlaceholderByFilterTypeAndOperator({
                            type: filterType,
                            operator: filterRule.operator,
                            disabled: true,
                        })}
                    />
                )}

                {(showValueInput || filterRule.required) && (
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

                {isEditMode && (
                    <>
                        {filterRule.required &&
                            (filterRule?.values || []).length > 0 && (
                                <Text size="xs" color={'gray.7'}>
                                    Temporary filter values for required filters
                                    will be removed on dashboard save
                                </Text>
                            )}
                        {!filterRule.required && (
                            <Tooltip
                                withinPortal
                                position="right"
                                label={
                                    isFilterDisabled
                                        ? 'Toggle on to set a default filter value'
                                        : 'Toggle off to leave the filter value empty, allowing users to populate it in view mode'
                                }
                                openDelay={500}
                            >
                                <Box w="max-content">
                                    <Switch
                                        label={
                                            <Text size="xs" mt="two" fw={500}>
                                                Provide default value
                                            </Text>
                                        }
                                        labelPosition="right"
                                        checked={!isFilterDisabled}
                                        onChange={(e) => {
                                            const newFilter: DashboardFilterRule =
                                                {
                                                    ...filterRule,
                                                    disabled:
                                                        !e.currentTarget
                                                            .checked,
                                                    required:
                                                        filterRule.required &&
                                                        !e.currentTarget.checked
                                                            ? // If the filter is required and the user is disabling it, we should also disable the required flag
                                                              false
                                                            : filterRule.required,
                                                };

                                            onChangeFilterRule(
                                                e.currentTarget.checked
                                                    ? newFilter
                                                    : getFilterRuleWithDefaultValue(
                                                          filterType,
                                                          field,
                                                          newFilter,
                                                          null,
                                                      ),
                                            );
                                        }}
                                    />
                                </Box>
                            </Tooltip>
                        )}

                        <Checkbox
                            size="xs"
                            checked={filterRule.required}
                            onChange={(e) => {
                                const newFilter: DashboardFilterRule = {
                                    ...filterRule,
                                    required: e.currentTarget.checked,
                                };

                                onChangeFilterRule(
                                    e.currentTarget.checked
                                        ? newFilter
                                        : getFilterRuleWithDefaultValue(
                                              filterType,
                                              field,
                                              newFilter,
                                              null,
                                          ),
                                );
                            }}
                            label="Require value for dashboard to run"
                        />
                    </>
                )}
            </Stack>
        </Stack>
    );
};

export default FilterSettings;
