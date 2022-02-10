import { Intent } from '@blueprintjs/core';
import {
    DashboardFilterRule,
    fieldId,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
} from 'common';
import React, { FC, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    FilterTypeConfig,
    getFilterTypeFromField,
} from '../../common/Filters/configs';
import {
    ApplyFilterButton,
    BackButton,
    ConfigureFilterWrapper,
    SelectField,
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
    const [internalFilterRule, setInternalFilterRule] =
        useState<DashboardFilterRule>(
            filterRule || {
                id: uuidv4(),
                target: {
                    fieldId: fieldId(field),
                    tableName: field.table,
                },
                operator: FilterOperator.EQUALS,
                values: [],
            },
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
            <SelectField
                fill
                onChange={(e) =>
                    setInternalFilterRule((prevState) => ({
                        ...prevState,
                        operator: e.currentTarget
                            .value as FilterRule['operator'],
                    }))
                }
                options={filterConfig.operatorOptions}
                value={internalFilterRule.operator}
            />
            <filterConfig.inputs
                filterType={filterType}
                field={field}
                filterRule={internalFilterRule}
                onChange={setInternalFilterRule as any}
            />
            <ApplyFilterButton
                type="submit"
                intent={Intent.PRIMARY}
                text="Apply"
                onClick={() => {
                    onSave(internalFilterRule);
                }}
            />
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
