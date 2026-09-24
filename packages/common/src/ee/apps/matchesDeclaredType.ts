// Leaf module: shared by `types.ts` and `preview.ts` without forming a cycle.
import assertUnreachable from '../../utils/assertUnreachable';
import {
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from './dataAppVizConfigOptions';

/** Whether a stored value still has the shape the option declares. */
export const matchesDeclaredType = (
    option: DataAppVizConfigOption,
    value: DataAppVizOptionValue,
): boolean => {
    switch (option.type) {
        case 'boolean':
            return typeof value === 'boolean';
        case 'number':
            return typeof value === 'number';
        case 'select':
            // A choice dropped by a regeneration is as stale as a wrong type.
            return option.choices.some((choice) => choice.value === value);
        case 'text':
        case 'color':
            return typeof value === 'string';
        default:
            return assertUnreachable(
                option,
                'Unknown data app viz config option type',
            );
    }
};
