import {
    DimensionType,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
    getFieldLabel,
    getFilterTypeFromField,
} from 'common';
import React, { FC, useMemo } from 'react';
import {
    formatBoolean,
    formatDate,
    formatTimestamp,
} from '../../../utils/resultFormatter';
import {
    filterOperatorLabel,
    FilterTypeConfig,
} from '../../common/Filters/configs';
import { FilterValues, TagContainer } from './ActiveFilters.styles';

type Props = {
    field: FilterableField;
    filterRule: FilterRule;
    onClick: () => void;
    onRemove: () => void;
};

const ActiveFilter: FC<Props> = ({ field, filterRule, onClick, onRemove }) => {
    const filterType = field
        ? getFilterTypeFromField(field)
        : FilterType.STRING;
    const filterConfig = useMemo(
        () => FilterTypeConfig[filterType],
        [filterType],
    );

    const operationLabel =
        filterConfig.operatorOptions.find(
            (option) => option.value === filterRule.operator,
        )?.label || filterOperatorLabel[filterRule.operator];

    let valuesText;
    switch (filterType) {
        case FilterType.STRING:
        case FilterType.NUMBER:
            valuesText = filterRule.values?.join(', ');
            break;
        case FilterType.BOOLEAN:
            valuesText = filterRule.values?.map(formatBoolean).join(', ');
            break;
        case FilterType.DATE: {
            if (filterRule.operator === FilterOperator.IN_THE_PAST) {
                valuesText = `${filterRule.values?.[0]} ${
                    filterRule.settings.completed ? 'completed ' : ''
                }${filterRule.settings.unitOfTime}`;
            } else {
                valuesText = filterRule.values
                    ?.map((value) => {
                        if (field.type === DimensionType.TIMESTAMP) {
                            return formatTimestamp(field.timeInterval)(value);
                        } else if (field.type === DimensionType.DATE) {
                            return formatDate(field.timeInterval)(value);
                        } else {
                            return value;
                        }
                    })
                    .join(', ');
            }
            break;
        }
        default: {
            const never: never = filterType;
            throw new Error(`Unexpected filter type: ${filterType}`);
        }
    }

    return (
        <TagContainer interactive onRemove={onRemove} onClick={onClick}>
            {`${getFieldLabel(field)} ${operationLabel} `}
            <FilterValues>{valuesText}</FilterValues>
        </TagContainer>
    );
};

export default ActiveFilter;
