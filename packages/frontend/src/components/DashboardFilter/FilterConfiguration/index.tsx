import { HTMLSelect, Intent } from '@blueprintjs/core';
import {
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    FilterableField,
    FilterRule,
    FilterType,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromField,
} from 'common';
import React, { FC, useMemo, useState } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { FilterTypeConfig } from '../../common/Filters/configs';
import {
    ApplyFilterButton,
    BackButton,
    ConfigureFilterWrapper,
    InputsWrapper,
    Title,
} from './FilterConfiguration.styled';

interface Props {
    field: FilterableField;
    filterRule?: DashboardFilterRule;
    onSave: (value: DashboardFilterRule) => void;
    onBack: () => void;
}

const FilterConfiguration: FC<Props> = ({
    field,
    filterRule,
    onSave,
    onBack,
}) => {
    const { setHaveFiltersChanged } = useDashboardContext();
    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule || createDashboardFilterRuleFromField(field),
        );

    const filterType = field
        ? getFilterTypeFromField(field)
        : FilterType.STRING;
    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    return (
        <ConfigureFilterWrapper>
            <BackButton minimal onClick={onBack}>
                Back
            </BackButton>
            <Title>{field.label}</Title>
            <InputsWrapper>
                <HTMLSelect
                    fill
                    onChange={(e) => {
                        setInternalFilterRule((prevState) =>
                            getFilterRuleWithDefaultValue(field, {
                                ...prevState,
                                operator: e.currentTarget
                                    .value as FilterRule['operator'],
                            }),
                        );
                        setHaveFiltersChanged(true);
                    }}
                    options={filterConfig.operatorOptions}
                    value={internalFilterRule.operator}
                />
                <filterConfig.inputs
                    filterType={filterType}
                    field={field}
                    filterRule={internalFilterRule}
                    onChange={setInternalFilterRule as any}
                />
            </InputsWrapper>
            <ApplyFilterButton
                type="submit"
                intent={Intent.PRIMARY}
                text="Apply"
                onClick={() => {
                    onSave(internalFilterRule);
                    setHaveFiltersChanged(true);
                }}
            />
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
