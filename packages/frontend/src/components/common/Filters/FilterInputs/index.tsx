import {
    assertUnreachable,
    FilterType,
    type BaseFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { type FilterPopoverProps } from '../context';
import BooleanFilterInputs from './BooleanFilterInputs';
import DateFilterInputs from './DateFilterInputs';
import DefaultFilterInputs from './DefaultFilterInputs';

export type FilterInputsProps<T extends BaseFilterRule> = {
    filterType: FilterType;
    field?: FilterableItem;
    rule: T;
    onChange: (value: T) => void;
    disabled?: boolean;
    popoverProps?: FilterPopoverProps;
};

const FilterInputComponent = <T extends BaseFilterRule>(
    props: FilterInputsProps<T>,
) => {
    switch (props.filterType) {
        case FilterType.STRING:
        case FilterType.NUMBER:
            return <DefaultFilterInputs<T> {...props} />;
        case FilterType.DATE:
            return <DateFilterInputs<T> {...props} />;
        case FilterType.BOOLEAN:
            return <BooleanFilterInputs<T> {...props} />;
        default:
            return assertUnreachable(
                props.filterType,
                `Unexpected filter type: ${props.filterType}`,
            );
    }
};

export default FilterInputComponent;
