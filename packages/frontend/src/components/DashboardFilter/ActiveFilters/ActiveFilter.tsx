import { Tooltip2 } from '@blueprintjs/popover2';
import { FilterableField, FilterRule } from '@lightdash/common';
import React, { FC } from 'react';
import { getFilterRuleLabel } from '../../common/Filters/configs';
import { FilterValues, TagContainer } from './ActiveFilters.styles';

type Props = {
    field: FilterableField;
    filterRule: FilterRule;
    onClick?: () => void;
    onRemove: () => void;
};

const ActiveFilter: FC<Props> = ({ field, filterRule, onClick, onRemove }) => {
    const filterRuleLabels = getFilterRuleLabel(filterRule, field);
    return (
        <TagContainer interactive onRemove={onRemove} onClick={onClick}>
            <Tooltip2
                content={`Table: ${field.tableLabel}`}
                interactionKind="hover"
                placement={'bottom-start'}
            >
                <>
                    {`${filterRuleLabels.field}:`}
                    {` ${filterRuleLabels.operator} `}
                    <FilterValues>{filterRuleLabels.value}</FilterValues>
                </>
            </Tooltip2>
        </TagContainer>
    );
};

export default ActiveFilter;
