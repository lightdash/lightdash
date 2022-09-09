// Code from https://github.com/tamas-pap/array-move-multiple
function normalizeIndexes<T>(indexes: Array<number>, array: Array<T>) {
    return indexes.filter((index) => index >= 0 && index < array.length);
}

function normalizeToIndex<T>(
    toIndex: number,
    array: Array<T>,
    moveIndexes: Array<number>,
) {
    return Math.min(Math.max(0, toIndex), array.length - moveIndexes.length);
}

export function arrayMoveByIndex<T>(
    array: Array<T>,
    index: number | Array<number>,
    toIndex: number,
) {
    const indexes = Array.isArray(index) ? index : [index];
    const normalizedIndexes = normalizeIndexes(indexes, array);
    const normalizedToIndex = normalizeToIndex(toIndex, array, indexes);

    const moveValues = normalizedIndexes.map((moveIndex) => array[moveIndex]);

    const dontMoveValues = array.filter(
        (item, i) => normalizedIndexes.indexOf(i) === -1,
    );

    dontMoveValues.splice(normalizedToIndex, 0, ...moveValues);
    return dontMoveValues;
}
