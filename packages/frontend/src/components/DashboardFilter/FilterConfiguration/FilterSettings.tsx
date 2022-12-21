import { FormGroup, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    DashboardFilterRule,
    FilterableField,
    FilterRule,
    FilterType,
    getFilterTypeFromField,
} from '@lightdash/common';
import { FC, useMemo } from 'react';
import { FilterTypeConfig } from '../../common/Filters/configs';

interface FilterSettingsProps {
    field: FilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Popover2Props;
    onChangeFilterOperator: (value: DashboardFilterRule['operator']) => void;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
}

const FilterSettings: FC<FilterSettingsProps> = ({
    field,
    filterRule,
    popoverProps,
    onChangeFilterOperator,
    onChangeFilterRule,
}) => {
    const filterType = field
        ? getFilterTypeFromField(field)
        : FilterType.STRING;

    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    return (
        <>
            <FormGroup label="Value">
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
            </FormGroup>

            <FormGroup>
                <filterConfig.inputs
                    popoverProps={popoverProps}
                    filterType={filterType}
                    field={field}
                    filterRule={filterRule}
                    onChange={(newFilterRule) =>
                        onChangeFilterRule(newFilterRule as DashboardFilterRule)
                    }
                />
            </FormGroup>
        </>
    );
};

export default FilterSettings;
