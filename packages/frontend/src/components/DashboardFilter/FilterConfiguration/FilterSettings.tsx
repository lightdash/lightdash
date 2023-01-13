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
import { BolderLabel } from '../FilterSearch/FilterSearch.styles';

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
    const filterType = field
        ? getFilterTypeFromField(field)
        : FilterType.STRING;

    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    return (
        <>
            <FormGroup label={<BolderLabel>Value</BolderLabel>}>
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
                    rule={filterRule}
                    onChange={(newFilterRule) =>
                        onChangeFilterRule(newFilterRule as DashboardFilterRule)
                    }
                />
            </FormGroup>

            {isEditMode && (
                <FormGroup label={<BolderLabel>Label</BolderLabel>}>
                    <InputGroup
                        fill
                        onChange={(e) =>
                            onChangeFilterRule({
                                ...filterRule,
                                label: e.target.value || undefined,
                            })
                        }
                        placeholder={`Defaults to "${field.label}"`}
                        value={filterRule.label || ''}
                    />
                </FormGroup>
            )}
        </>
    );
};

export default FilterSettings;
