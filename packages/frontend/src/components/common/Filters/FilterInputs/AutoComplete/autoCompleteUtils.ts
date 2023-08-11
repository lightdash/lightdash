import uniq from 'lodash-es/uniq';

export const toggleValueFromArray = <T extends string>(
    values: T[],
    value: T,
): T[] => {
    const index = values.findIndex((v) => v === value);

    if (index !== -1) {
        return [...values.slice(0, index), ...values.slice(index + 1)];
    } else {
        return [...values, value];
    }
};

export const mergeUniqueValues = (
    values: string[],
    newValues: string[],
): string[] => {
    const allValues = [...values, ...newValues];

    return uniq(allValues);
};
