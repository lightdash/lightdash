import {
    Explore,
    Field,
    fieldId,
    FilterRule,
    getVisibleFields,
    isFilterableField,
} from '@lightdash/common';
import { FC, useCallback } from 'react';
import { getFilterRuleLabel } from '../../common/Filters/configs';
import { FilterValues, TagContainer } from './FiltersCard.styles';

type Props = {
    filterRules: FilterRule[];
    explore: Explore | undefined;
};

export const FilterRulesApplied: FC<Props> = ({ filterRules, explore }) => {
    const renderFilterRule = useCallback(
        (filterRule: FilterRule) => {
            const fields: Field[] = explore ? getVisibleFields(explore) : [];
            const field = fields.find(
                (f) => fieldId(f) === filterRule.target.fieldId,
            );
            if (field && isFilterableField(field)) {
                const filterRuleLabels = getFilterRuleLabel(filterRule, field);
                return (
                    <TagContainer>
                        {filterRuleLabels.field}: {filterRuleLabels.operator}{' '}
                        <FilterValues>{filterRuleLabels.value}</FilterValues>
                    </TagContainer>
                );
            }
            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;
        },
        [explore],
    );

    return <>{filterRules.map(renderFilterRule)}</>;
};
