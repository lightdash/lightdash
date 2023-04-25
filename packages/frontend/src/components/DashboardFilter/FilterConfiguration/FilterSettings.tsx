import {
    DashboardFilterRule,
    FilterableField,
    FilterRule,
    FilterType,
    getFilterTypeFromItem,
} from '@lightdash/common';
import { PopoverProps, Select, TextInput } from '@mantine/core';
import { FC, useMemo } from 'react';
import { FilterTypeConfig } from '../../common/Filters/configs';

interface FilterSettingsProps {
    isEditMode: boolean;
    field: FilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Pick<PopoverProps, 'onOpen' | 'onClose'>;
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

    return (
        <>
            <Select
                label="Value"
                onChange={(value) =>
                    onChangeFilterOperator(value as FilterRule['operator'])
                }
                data={filterConfig.operatorOptions}
                value={filterRule.operator}
            />

            <filterConfig.inputs
                popoverProps={popoverProps}
                filterType={filterType}
                field={field}
                rule={filterRule}
                onChange={(newFilterRule) =>
                    onChangeFilterRule(newFilterRule as DashboardFilterRule)
                }
            />

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
        </>
    );
};

export default FilterSettings;
