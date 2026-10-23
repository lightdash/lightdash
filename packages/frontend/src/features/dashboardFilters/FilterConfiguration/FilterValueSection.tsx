import {
    FilterOperator,
    FilterType,
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
    Group,
    Text,
    Select,
    Switch,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconHelpCircle, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import FilterInputComponent from '../../../components/common/Filters/FilterInputs';
import { getFilterOperatorOptions } from '../../../components/common/Filters/FilterInputs/utils';
import FilterOperatorOption from '../../../components/common/Filters/FilterOperatorOption';
import { getPlaceholderByFilterTypeAndOperator } from '../../../components/common/Filters/utils/getPlaceholderByFilterTypeAndOperator';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useApp from '../../../providers/App/useApp';
import {
    getFilterRuleWithDefaultValueEnabled,
    getFilterRuleWithOperator,
} from './utils';

type Props = {
    isEditMode: boolean;
    isCreatingNew: boolean;
    filterType: FilterType;
    field?: DashboardFilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
};

// The value part of the settings form: operator, value and default value
export const FilterValueSection: FC<Props> = ({
    isEditMode,
    isCreatingNew,
    filterType,
    field,
    filterRule,
    popoverProps,
    onChangeFilterRule,
}) => {
    const { user } = useApp();
    const canManageExplore = user.data?.ability?.can('manage', 'Explore');
    const getUiString = useUiStrings();

    const filterOperatorOptions = useMemo(
        () => getFilterOperatorOptions(filterType, field, getUiString),
        [filterType, field, getUiString],
    );

    const handleChangeFilterOperator = (operator: FilterRule['operator']) =>
        onChangeFilterRule(
            getFilterRuleWithOperator(filterType, field, filterRule, operator),
        );

    const isFilterDisabled = !!filterRule.disabled;

    const hasRequirement =
        !!filterRule.required || !!filterRule.requiredGroupId;

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
        <>
            {isCreatingNew && !isEditMode && (
                <Text size="xs" fw={500}>
                    {getUiString('filters.config.valueLabel')}
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
                    handleChangeFilterOperator(value as FilterRule['operator'])
                }
                value={filterRule.operator}
                renderOption={({ option }) => (
                    <FilterOperatorOption
                        operator={option.value as FilterOperator}
                        label={option.label}
                    />
                )}
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
                        getUiString,
                        type: filterType,
                        operator: filterRule.operator,
                        disabled: true,
                    })}
                />
            )}

            {(showValueInput || hasRequirement) && (
                <Group gap="xs" wrap="nowrap" align="flex-start">
                    <Box flex={1}>
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
                                label={getUiString(
                                    filterRule.disabled
                                        ? 'filters.config.alreadyAnyValue'
                                        : (filterRule.values?.length ?? 0) === 0
                                          ? 'filters.config.noValueToClear'
                                          : 'filters.config.clearToAnyValue',
                                )}
                            >
                                <ActionIcon
                                    size="sm"
                                    mt={4}
                                    disabled={
                                        filterRule.disabled ||
                                        (filterRule.values?.length ?? 0) === 0
                                    }
                                    onClick={() =>
                                        onChangeFilterRule({
                                            ...filterRule,
                                            values: [],
                                            ...(filterType === FilterType.DATE
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
                                    onChange={(e) =>
                                        onChangeFilterRule(
                                            getFilterRuleWithDefaultValueEnabled(
                                                filterType,
                                                field,
                                                filterRule,
                                                e.currentTarget.checked,
                                            ),
                                        )
                                    }
                                />
                            </Box>
                        </Tooltip>
                    )}
                </>
            )}
        </>
    );
};
