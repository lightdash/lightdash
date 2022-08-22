import { Classes, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardFilterRule, FilterableField } from '@lightdash/common';
import { FC } from 'react';
import { getFilterRuleLabel } from '../../common/Filters/configs';
import FilterConfiguration from '../FilterConfiguration';
import {
    FilterValues,
    InvalidFilterTag,
    TagContainer,
} from './ActiveFilters.styles';

type Props = {
    fieldId: string;
    field: FilterableField | undefined;
    filterRule: DashboardFilterRule;
    onClick?: () => void;
    onRemove: () => void;
    onUpdate: (value: DashboardFilterRule) => void;
};

const ActiveFilter: FC<Props> = ({
    fieldId,
    field,
    filterRule,
    onClick,
    onRemove,
    onUpdate,
}) => {
    if (!field) {
        return (
            <InvalidFilterTag onRemove={onRemove}>
                Tried to reference field with unknown id: {fieldId}
            </InvalidFilterTag>
        );
    }
    const filterRuleLabels = getFilterRuleLabel(filterRule, field);
    return (
        <Popover2
            content={
                <FilterConfiguration
                    field={field}
                    filterRule={filterRule}
                    onSave={onUpdate}
                />
            }
            popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
            position="bottom"
        >
            <TagContainer interactive onRemove={onRemove} onClick={onClick}>
                <Tooltip2
                    content={`Table: ${field.tableLabel}`}
                    interactionKind="hover"
                    placement={'bottom-start'}
                >
                    <>
                        {`${filterRuleLabels.field}: ${filterRuleLabels.operator} `}
                        <FilterValues>{filterRuleLabels.value}</FilterValues>
                    </>
                </Tooltip2>
            </TagContainer>
        </Popover2>
    );
};

export default ActiveFilter;
