type Normalizer<T, Comparable = T> = (a: T) => Comparable;

const equalityComparator = <T extends string>(
    normalizer: Normalizer<T> = (a) => a,
) => {
    return (a: T, b: T) => {
        return normalizer(a) === normalizer(b);
    };
};

const includesComparator = <T extends string>(
    normalizer: Normalizer<T> = (a) => a,
) => {
    return (a: T, b: T) => {
        return normalizer(a).includes(normalizer(b));
    };
};

const id = <T>(a: T) => a;
const normalize = (item: string) => item.toLocaleLowerCase();

export const isMatch = includesComparator(normalize);
const isExactMatch = equalityComparator(id);
const isIncludesMatch = includesComparator(normalize);

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

export function itemPredicate(
    query: string,
    item: string,
    _index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    if (exactMatch) {
        return isExactMatch(item, query);
    } else {
        return isIncludesMatch(item, query);
    }
}
