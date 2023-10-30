import uniq from 'lodash-es/uniq';

export const mergeUniqueValues = (
    values: string[],
    newValues: string[],
): string[] => {
    const allValues = [...values, ...newValues];

    return uniq(allValues);
};
