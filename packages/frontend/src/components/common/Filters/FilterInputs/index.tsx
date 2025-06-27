import {
    FilterType,
    assertUnreachable,
    type BaseFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import BooleanFilterInputs from './BooleanFilterInputs';
import DateFilterInputs from './DateFilterInputs';
import DefaultFilterInputs from './DefaultFilterInputs';

export type FilterInputsProps<T extends BaseFilterRule> = {
    filterType: FilterType;
    field?: FilterableItem;
    rule: T;
    onChange: (value: T) => void;
    disabled?: boolean;
    popoverProps?: Omit<PopoverProps, 'children'>;
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
