import {
    isField,
    type ItemsMap,
    type MergeFieldOrigins,
} from '@lightdash/common';

const formatSignature = (item: ItemsMap[string] | undefined): string =>
    isField(item) ? (item.format ?? '') : '';

/**
 * Which y-axis each merged series should start on.
 *
 * A merge almost always puts two units side by side (a rating next to a
 * percentage), and on one axis the smaller series flattens to the baseline
 * and reads as empty. When the y fields come from more than one source and
 * their formats differ, every source after the first goes on the right axis.
 * Fields from one source, or two sources sharing a format, stay together.
 */
export const getMergeDefaultYAxisIndexByField = ({
    yFields,
    itemsMap,
    fieldOrigins,
}: {
    yFields: string[];
    itemsMap: ItemsMap | undefined;
    fieldOrigins: MergeFieldOrigins | undefined;
}): Record<string, number> => {
    if (!fieldOrigins || !itemsMap) return {};
    const sourceOf = (fieldId: string): string | null => {
        const origin = fieldOrigins[fieldId];
        return origin?.kind === 'source' ? origin.sourceId : null;
    };
    const sourceIds = yFields.reduce<string[]>((ids, fieldId) => {
        const sourceId = sourceOf(fieldId);
        return sourceId === null || ids.includes(sourceId)
            ? ids
            : [...ids, sourceId];
    }, []);
    if (sourceIds.length < 2) return {};

    const formatsOf = (sourceId: string) =>
        new Set(
            yFields
                .filter((fieldId) => sourceOf(fieldId) === sourceId)
                .map((fieldId) => formatSignature(itemsMap[fieldId])),
        );
    const [firstSourceId, ...otherSourceIds] = sourceIds;
    const firstFormats = formatsOf(firstSourceId);
    const formatsDiffer = otherSourceIds.some((sourceId) =>
        [...formatsOf(sourceId)].some((format) => !firstFormats.has(format)),
    );
    if (!formatsDiffer) return {};

    return Object.fromEntries(
        yFields.map((fieldId) => [
            fieldId,
            sourceOf(fieldId) === firstSourceId ? 0 : 1,
        ]),
    );
};
