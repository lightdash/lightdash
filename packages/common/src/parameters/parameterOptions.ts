import {
    isLightdashParameterOption,
    type LightdashProjectParameter,
} from '../types/lightdashProjectConfig';
import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '../types/parameters';

// Values a fixed-options parameter accepts, or null when any value is accepted.
// A configured default is always accepted, even when it is not listed in options.
const getAllowedParameterValues = (
    definition: LightdashProjectParameter,
): Set<string> | null => {
    if (
        !definition.options ||
        definition.allow_custom_values ||
        definition.options_from_dimension ||
        definition.type === 'date'
    ) {
        return null;
    }

    const optionValues = definition.options.map((option) =>
        isLightdashParameterOption(option) ? option.value : option,
    );
    const defaultValues =
        definition.default === undefined ? [] : [definition.default].flat();
    return new Set([...optionValues, ...defaultValues].map(String));
};

/**
 * The value with anything outside the parameter's fixed options removed, or null when
 * nothing valid is left, so callers fall back to the next source (ultimately the default).
 */
export const getAllowedParameterValue = (
    definition: LightdashProjectParameter | undefined,
    value: ParameterValue,
): ParameterValue | null => {
    const allowedValues = definition
        ? getAllowedParameterValues(definition)
        : null;
    if (!allowedValues) return value;

    if (!Array.isArray(value)) {
        return allowedValues.has(String(value)) ? value : null;
    }

    const allowedItems = value.filter((item) =>
        allowedValues.has(String(item)),
    );
    if (allowedItems.length === value.length) return value;
    return allowedItems.length > 0 ? (allowedItems as ParameterValue) : null;
};

export const omitDisallowedParameterValues = (
    values: ParametersValuesMap,
    definitions: ParameterDefinitions,
): ParametersValuesMap =>
    Object.entries(values).reduce<ParametersValuesMap>((acc, [key, value]) => {
        if (value === undefined || value === null) return acc;
        const allowedValue = getAllowedParameterValue(definitions[key], value);
        return allowedValue === null ? acc : { ...acc, [key]: allowedValue };
    }, {});

/**
 * Whether a control set through `base` can also set `candidate`: the same
 * type, the same `multiple` and the same allowed values. One that accepts any value can join
 * a fixed-options control, never the reverse.
 */
export const isParameterCompatible = (
    base: LightdashProjectParameter,
    candidate: LightdashProjectParameter,
): boolean => {
    // A value of one type would reach SQL that expects another
    if ((base.type ?? 'string') !== (candidate.type ?? 'string')) return false;
    if (Boolean(base.multiple) !== Boolean(candidate.multiple)) return false;
    const candidateValues = getAllowedParameterValues(candidate);
    if (candidateValues === null) return true;
    const baseValues = getAllowedParameterValues(base);
    return (
        baseValues !== null &&
        baseValues.size === candidateValues.size &&
        [...baseValues].every((value) => candidateValues.has(value))
    );
};
