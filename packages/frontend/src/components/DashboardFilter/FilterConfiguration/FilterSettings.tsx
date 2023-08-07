import { HTMLSelect } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    DashboardFilterRule,
    FilterableField,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItem,
} from '@lightdash/common';
import { Stack, Switch, TextInput, Tooltip } from '@mantine/core';
import { FC, useEffect, useMemo, useState } from 'react';
import { FilterTypeConfig } from '../../common/Filters/configs';
import { getPlaceholderByFilterTypeAndOperator } from '../../common/Filters/utils/getPlaceholderByFilterTypeAndOperator';

interface FilterSettingsProps {
    isEditMode: boolean;
    field: FilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Popover2Props;
    onChangeFilterOperator: (value: DashboardFilterRule['operator']) => void;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
}

const FilterSettings: FC<FilterSettingsProps> = ({
    isEditMode,
    field,
    filterRule,
    popoverProps,
    onChangeFilterOperator,
    onChangeFilterRule,
}) => {
    const [filterLabel, setFilterLabel] = useState<string>(
        filterRule.label ?? field.label,
    );
    const filterType = field ? getFilterTypeFromItem(field) : FilterType.STRING;

    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    useEffect(() => {
        if (!isEditMode && filterRule.disabled) {
            onChangeFilterRule({
                ...filterRule,
                disabled: false,
                values: undefined,
                settings: undefined,
            });
        }
    }, [isEditMode, onChangeFilterRule, filterRule]);

    return (
        <Stack>
            <Stack spacing="xs">
                {isEditMode && (
                    <Tooltip
                        withinPortal
                        position="right"
                        label={
                            filterRule.disabled
                                ? 'Toggle on to set a default filter value'
                                : 'Toggle off to leave the filter value empty, allowing users to populate it in view mode'
                        }
                        openDelay={500}
                    >
                        <div style={{ width: 'max-content' }}>
                            <Switch
                                label="Default value"
                                labelPosition="left"
                                checked={!filterRule.disabled}
                                onChange={(e) => {
                                    const newFilter: DashboardFilterRule = {
                                        ...filterRule,
                                        disabled: !e.currentTarget.checked,
                                    };

                                    onChangeFilterRule(
                                        e.currentTarget.checked
                                            ? newFilter
                                            : getFilterRuleWithDefaultValue(
                                                  field,
                                                  newFilter,
                                              ),
                                    );
                                }}
                            />
                        </div>
                    </Tooltip>
                )}

                <HTMLSelect
                    fill
                    onChange={(e) =>
                        onChangeFilterOperator(
                            e.target.value as FilterRule['operator'],
                        )
                    }
                    options={filterConfig.operatorOptions}
                    value={filterRule.operator}
                />
                {filterRule.disabled ? (
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
                    <filterConfig.inputs
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

            {isEditMode && (
                <TextInput
                    label="Filter label"
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
        </Stack>
    );
};

export default FilterSettings;
