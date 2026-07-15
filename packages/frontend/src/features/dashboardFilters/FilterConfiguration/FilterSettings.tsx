import {
    FilterOperator,
    FilterType,
    getFilterRuleWithDefaultValue,
    supportsSingleValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterRule,
} from '@lightdash/common';
import {
    TextInput,
    ActionIcon,
    Box,
    Button,
    Checkbox,
    Group,
    Stack,
    Text,
    Select,
    Switch,
} from '@mantine-8/core';
import { Tooltip, type PopoverProps } from '@mantine/core';
import { IconHelpCircle, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import FilterInputComponent from '../../../components/common/Filters/FilterInputs';
import { filterOperatorDescription } from '../../../components/common/Filters/FilterInputs/constants';
import { getFilterOperatorOptions } from '../../../components/common/Filters/FilterInputs/utils';
import { getPlaceholderByFilterTypeAndOperator } from '../../../components/common/Filters/utils/getPlaceholderByFilterTypeAndOperator';
import MantineIcon from '../../../components/common/MantineIcon';
import useApp from '../../../providers/App/useApp';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import RequiredFilterCard from '../FilterRequirements/RequiredFilterCard';

interface FilterSettingsProps {
    isEditMode: boolean;
    isCreatingNew: boolean;
    filterType: FilterType;
    field?: DashboardFilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
    onEditRequirementRules?: () => void;
}

const FilterSettings: FC<FilterSettingsProps> = ({
    isEditMode,
    isCreatingNew,
    field,
    filterType,
    filterRule,
    popoverProps,
    onChangeFilterRule,
    onEditRequirementRules,
}) => {
    const { user } = useApp();
    const canManageExplore = user.data?.ability?.can('manage', 'Explore');

    const [filterLabel, setFilterLabel] = useState<string>();

    const filterOperatorOptions = useMemo(
        () => getFilterOperatorOptions(filterType, field),
        [filterType, field],
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

    const isFilterRequirementsEnabled = useDashboardContext(
        (c) => c.isFilterRequirementsEnabled,
    );

    const hasRequirement =
        !!filterRule.required ||
        (isFilterRequirementsEnabled && !!filterRule.requiredGroupId);

    const handleToggleRequired = (checked: boolean) => {
        // Toggling on creates a one-member rule; off removes it from its rule.
        // Flag off leaves group membership untouched (main parity).
        const newFilter: DashboardFilterRule = {
            ...filterRule,
            required: checked,
            requiredGroupId: isFilterRequirementsEnabled
                ? undefined
                : filterRule.requiredGroupId,
        };

        onChangeFilterRule(
            checked
                ? newFilter
                : getFilterRuleWithDefaultValue(
                      filterType,
                      field,
                      newFilter,
                      null,
                  ),
        );
    };

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
            <Stack gap="xs">
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
                    allowDeselect={false}
                    size="xs"
                    data={filterOperatorOptions}
                    comboboxProps={{ withinPortal: popoverProps?.withinPortal }}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    onChange={(value) =>
                        value &&
                        handleChangeFilterOperator(
                            value as FilterRule['operator'],
                        )
                    }
                    value={filterRule.operator}
                    renderOption={({ option }) => {
                        const description =
                            filterOperatorDescription[
                                option.value as FilterOperator
                            ];
                        if (description) {
                            return (
                                <Tooltip
                                    label={description}
                                    position="right"
                                    multiline
                                    maw={300}
                                    withinPortal
                                >
                                    <div>{option.label}</div>
                                </Tooltip>
                            );
                        }
                        return <div>{option.label}</div>;
                    }}
                    rightSectionWidth={140}
                    rightSectionPointerEvents="all"
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
                                size="compact-xs"
                                variant={'light'}
                                rightSection={
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
                {showAnyValueDisabledInput && !hasRequirement && (
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

                {(showValueInput || hasRequirement) && (
                    <Group gap="xs" wrap="nowrap" align="flex-start">
                        <Box style={{ flex: 1 }}>
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
                        </Box>
                        {canManageExplore &&
                            !isEditMode &&
                            !hasRequirement &&
                            ![
                                FilterOperator.NULL,
                                FilterOperator.NOT_NULL,
                            ].includes(filterRule.operator) && (
                                <Tooltip
                                    label={
                                        filterRule.disabled
                                            ? 'Already showing any value'
                                            : (filterRule.values?.length ??
                                                    0) === 0
                                              ? 'No value to clear'
                                              : 'Clear to any value'
                                    }
                                >
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        mt={4}
                                        disabled={
                                            filterRule.disabled ||
                                            (filterRule.values?.length ?? 0) ===
                                                0
                                        }
                                        onClick={() =>
                                            onChangeFilterRule({
                                                ...filterRule,
                                                values: [],
                                                ...(filterType ===
                                                FilterType.DATE
                                                    ? { settings: undefined }
                                                    : {}),
                                            })
                                        }
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                    </Group>
                )}

                {isEditMode && (
                    <>
                        {hasRequirement &&
                            (filterRule?.values || []).length > 0 && (
                                <Text size="xs" c={'ldGray.7'}>
                                    Temporary filter values for required filters
                                    will be removed on dashboard save
                                </Text>
                            )}
                        {!hasRequirement && (
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
                                                    // Toggling a default value removes the filter from any requirement rule; flag off leaves it untouched
                                                    requiredGroupId:
                                                        isFilterRequirementsEnabled
                                                            ? undefined
                                                            : filterRule.requiredGroupId,
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

                        {isFilterRequirementsEnabled ? (
                            <RequiredFilterCard
                                filterRule={filterRule}
                                onToggleRequired={handleToggleRequired}
                                onChangeFilterRule={onChangeFilterRule}
                                onEditRules={onEditRequirementRules}
                            />
                        ) : (
                            <Checkbox
                                size="xs"
                                checked={filterRule.required}
                                onChange={(e) =>
                                    handleToggleRequired(
                                        e.currentTarget.checked,
                                    )
                                }
                                label="Require viewers to pick a value to load the dashboard"
                            />
                        )}
                    </>
                )}
            </Stack>
        </Stack>
    );
};

export default FilterSettings;
