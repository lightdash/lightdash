import {
    formatDate,
    parseDate,
    resolveParameterDefault,
    TimeFrames,
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';

/** What a parameter pill shows: the value, else its default, else "any value" */
export const getParameterDisplayValue = (
    parameter: LightdashProjectParameter,
    value: ParameterValue | null,
): string => {
    if (value === null || value === undefined || value === '') {
        const defaultVal = resolveParameterDefault(parameter);
        if (defaultVal !== undefined) {
            if (parameter.type === 'date' && typeof defaultVal === 'string') {
                const date = parseDate(defaultVal, TimeFrames.DAY);
                return date
                    ? formatDate(date, TimeFrames.DAY, false)
                    : defaultVal;
            }
            if (Array.isArray(defaultVal)) {
                return defaultVal.join(', ');
            }
            return String(defaultVal);
        }
        return 'any value';
    }

    if (parameter.type === 'date' && typeof value === 'string') {
        const date = parseDate(value, TimeFrames.DAY);
        return date ? formatDate(date, TimeFrames.DAY, false) : value;
    }

    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return String(value);
};
