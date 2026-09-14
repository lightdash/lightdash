// Query tags are typed as strings, but values can drift at runtime — e.g.
// scheduler job ids arrive as BigInt via the global pg INT8 parser override.
export type DriftedTagValue =
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined;

export const coerceTagToString = (
    tag: DriftedTagValue,
    context: { caller: string; key: string | null },
): string => {
    if (typeof tag === 'string') return tag;
    if (tag === null || tag === undefined) return '';
    console.warn(`${context.caller}: coerced non-string tag value`, {
        ...(context.key === null ? {} : { key: context.key }),
        valueType: typeof tag,
    });
    return String(tag);
};
