import {
    FilterOperator,
    FilterType,
    getFilterRuleWithDefaultValue,
    supportsSingleValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterRule,
} from '@lightdash/common';
import { Box, Radio, Stack } from '@mantine-8/core';
import {
    ActionIcon,
    Button,
    Group,
    Select,
    Switch,
    TextInput,
    Tooltip,
    type PopoverProps,
    Text,
} from '@mantine/core';
import { IconHelpCircle, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FilterInputComponent from '../../../components/common/Filters/FilterInputs';
import { filterOperatorDescription } from '../../../components/common/Filters/FilterInputs/constants';
import { getFilterOperatorOptions } from '../../../components/common/Filters/FilterInputs/utils';
import { getPlaceholderByFilterTypeAndOperator } from '../../../components/common/Filters/utils/getPlaceholderByFilterTypeAndOperator';
import MantineIcon from '../../../components/common/MantineIcon';
import useApp from '../../../providers/App/useApp';

export type FilterRuleSummary = {
    id: string;
    label: string;
    requiredGroupId: string | undefined;
};

type FilterRequirement = 'none' | 'required' | 'group';

interface FilterSettingsProps {
    isEditMode: boolean;
    isCreatingNew: boolean;
    filterType: FilterType;
    field?: DashboardFilterableField;
    filterRule: DashboardFilterRule;
    otherFilterRules: FilterRuleSummary[];
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
}

const FilterSettings: FC<FilterSettingsProps> = ({
    isEditMode,
    isCreatingNew,
    field,
    filterType,
    filterRule,
    otherFilterRules,
    popoverProps,
    onChangeFilterRule,
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

    // `required` wins when hand-authored JSON sets both flags
    const isRequired = !!filterRule.required;
    const activeGroupId = isRequired ? undefined : filterRule.requiredGroupId;
    const hasRequirement = isRequired || !!filterRule.requiredGroupId;
    const requirementValue: FilterRequirement = isRequired
        ? 'required'
        : activeGroupId
          ? 'group'
          : 'none';

    const otherGroupMemberLabels = useMemo(
        () =>
            activeGroupId
                ? otherFilterRules
                      .filter((rule) => rule.requiredGroupId === activeGroupId)
                      .map((rule) => rule.label)
                : [],
        [otherFilterRules, activeGroupId],
    );

    const handleChangeRequirement = (value: string) => {
        if (value === 'required') {
            onChangeFilterRule({
                ...filterRule,
                required: true,
                requiredGroupId: undefined,
            });
        } else if (value === 'group') {
            // Single implicit group per dashboard: reuse the group id from any
            // other filter, otherwise start a new group
            const existingGroupId = otherFilterRules.find(
                (rule) => rule.requiredGroupId,
            )?.requiredGroupId;
            onChangeFilterRule({
                ...filterRule,
                required: false,
                requiredGroupId:
                    filterRule.requiredGroupId ?? existingGroupId ?? uuidv4(),
            });
        } else {
            onChangeFilterRule(
                getFilterRuleWithDefaultValue(
                    filterType,
                    field,
                    {
                        ...filterRule,
                        required: false,
                        requiredGroupId: undefined,
                    },
                    null,
                ),
            );
        }
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
                    size="xs"
                    data={filterOperatorOptions}
                    withinPortal={popoverProps?.withinPortal}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    onChange={handleChangeFilterOperator}
                    value={filterRule.operator}
                    itemComponent={({ label, value, ...others }) => {
                        const description =
                            filterOperatorDescription[value as FilterOperator];
                        if (description) {
                            return (
                                <Tooltip
                                    label={description}
                                    position="right"
                                    multiline
                                    maw={300}
                                    withinPortal
                                >
                                    <div {...others}>{label}</div>
                                </Tooltip>
                            );
                        }
                        return <div {...others}>{label}</div>;
                    }}
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
                    <Group spacing="xs" noWrap align="flex-start">
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
                            !filterRule.required &&
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
                                                    requiredGroupId:
                                                        filterRule.requiredGroupId &&
                                                        !e.currentTarget.checked
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

                        <Radio.Group
                            size="xs"
                            label="Viewer requirement"
                            value={requirementValue}
                            onChange={handleChangeRequirement}
                        >
                            <Stack gap="xs" mt="xs">
                                <Radio
                                    size="xs"
                                    value="none"
                                    label="Not required"
                                />
                                <Radio
                                    size="xs"
                                    value="required"
                                    label="Required"
                                    description="Viewers must set this filter to load the dashboard"
                                />
                                <Radio
                                    size="xs"
                                    value="group"
                                    label="Required as part of a group"
                                    description="Viewers must set at least one filter in the group to load the dashboard"
                                />
                                {requirementValue === 'group' && (
                                    <Text size="xs" c="ldGray.6" pl="xl">
                                        {otherGroupMemberLabels.length > 0
                                            ? `In this group: ${otherGroupMemberLabels.join(
                                                  ', ',
                                              )}`
                                            : 'No other filters in this group yet'}
                                    </Text>
                                )}
                            </Stack>
                        </Radio.Group>
                    </>
                )}
            </Stack>
        </Stack>
    );
};

export default FilterSettings;
