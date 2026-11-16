import {
    formatDate,
    isLightdashParameterOption,
    parseDate,
    resolveParameterDefault,
    TimeFrames,
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';

const formatValue = (
    parameter: LightdashProjectParameter,
    value: ParameterValue,
): string => {
    if (parameter.type === 'date' && typeof value === 'string') {
        const date = parseDate(value, TimeFrames.DAY);
        return date ? formatDate(date, TimeFrames.DAY, false) : value;
    }
    const options: unknown[] = parameter.options ?? [];
    const toLabel = (item: string | number) => {
        const option = options.find(
            (opt) =>
                isLightdashParameterOption(opt) &&
                String(opt.value) === String(item),
        );
        return isLightdashParameterOption(option) && option.label
            ? option.label
            : String(item);
    };
    return Array.isArray(value)
        ? value.map(toLabel).join(', ')
        : toLabel(value);
};

/** What a parameter pill shows: the value, else its default, else "any value" */
export const getParameterDisplayValue = (
    parameter: LightdashProjectParameter,
    value: ParameterValue | null,
): string => {
    if (value === null || value === undefined || value === '') {
        const defaultVal = resolveParameterDefault(parameter);
        return defaultVal !== undefined
            ? formatValue(parameter, defaultVal)
            : 'any value';
    }
    return formatValue(parameter, value);
};
