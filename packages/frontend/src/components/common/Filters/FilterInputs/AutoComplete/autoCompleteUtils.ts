type Normalizer<T, Comparable = T> = (a: T) => Comparable;

export const comparator = <T>(normalizer: Normalizer<T> = (a) => a) => {
    return (a: T, b: T): boolean => {
        return normalizer(a) === normalizer(b);
    };
};

export const toggleValueFromArray = <T>(
    values: T[],
    value: T,
    normalizer: Normalizer<T> = (a) => a,
): T[] => {
    if (values.map(normalizer).includes(normalizer(value))) {
        const itemComparator = comparator(normalizer);
        return values.filter((v) => !itemComparator(v, value));
    } else {
        return [...values, value];
    }
};

export function itemPredicate(
    query: string,
    item: string,
    index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    if (exactMatch) {
        return query === item;
    }
    return item.toLowerCase().includes(query.toLowerCase());
}
