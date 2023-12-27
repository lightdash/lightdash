import {
    assertUnreachable,
    ConditionalRule,
    FilterType,
} from '@lightdash/common';
import { FilterInputsProps } from '.';
import BooleanFilterInputs from './BooleanFilterInputs';
import DateFilterInputs from './DateFilterInputs';
import DefaultFilterInputs from './DefaultFilterInputs';

export const FilterInputComponent = <T extends ConditionalRule>(
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
