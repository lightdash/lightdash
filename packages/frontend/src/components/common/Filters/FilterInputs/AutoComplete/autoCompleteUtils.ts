import uniqBy from 'lodash-es/uniqBy';

type Normalizer<T, Comparable = T> = (a: T) => Comparable;

const includesComparator = <T extends string>(
    normalizer: Normalizer<T> = (a) => a,
) => {
    return (a: T, b: T) => {
        return normalizer(a).includes(normalizer(b));
    };
};

const normalize = (item: string) => item.toLocaleLowerCase();

export const isMatch = includesComparator(normalize);

export const toggleValueFromArray = <T extends string>(
    values: T[],
    value: T,
): T[] => {
    const index = values.map(normalize).findIndex((v) => isMatch(v, value));

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
    const normalizedValues = [
        ...values.map(normalize),
        ...newValues.map(normalize),
    ];

    return uniqBy(normalizedValues, normalize);
};
