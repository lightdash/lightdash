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
import { Stack, Switch, TextInput } from '@mantine/core';
import { FC, useMemo } from 'react';
import { FilterTypeConfig } from '../../common/Filters/configs';

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
    const filterType = field ? getFilterTypeFromItem(field) : FilterType.STRING;

    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    const handleOnSwitchChange:
        | React.ChangeEventHandler<HTMLInputElement>
        | undefined = (e) => {
        const isToggled = e.currentTarget.checked;

        let filterValues: FilterRule['values'] = [];
        if (isToggled) {
            filterValues = filterRule.values?.length
                ? filterRule.values
                : getFilterRuleWithDefaultValue(field, filterRule).values;
        }

        onChangeFilterRule({
            ...filterRule,
            disabled: !isToggled,
            values: filterValues,
        });
    };

    return (
        <Stack>
            <Stack spacing="xs">
                <Switch
                    label="Default value"
                    labelPosition="left"
                    checked={!filterRule.disabled}
                    onChange={handleOnSwitchChange}
                />

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

                <filterConfig.inputs
                    popoverProps={popoverProps}
                    filterType={filterType}
                    field={field}
                    disabled={filterRule.disabled}
                    rule={filterRule}
                    onChange={(newFilterRule) =>
                        onChangeFilterRule(newFilterRule as DashboardFilterRule)
                    }
                />
            </Stack>

            {isEditMode && (
                <TextInput
                    label="Label"
                    onChange={(e) =>
                        onChangeFilterRule({
                            ...filterRule,
                            label: e.target.value || undefined,
                        })
                    }
                    placeholder={`Defaults to "${field.label}"`}
                    value={filterRule.label || ''}
                />
            )}
        </Stack>
    );
};

export default FilterSettings;
