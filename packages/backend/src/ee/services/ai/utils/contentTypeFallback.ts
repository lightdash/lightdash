import { NotFoundError } from '@lightdash/common';

export type ContentTypeMatch<T extends string, R> = {
    value: R;
    type: T;
    /** Set when the slug was found under another type than requested. */
    note: string | null;
};

const listTypes = (types: readonly string[]) =>
    types.length > 1
        ? `${types.slice(0, -1).join(', ')} and ${types[types.length - 1]}`
        : types.join('');

/**
 * Reads `slug` as `type`; on NotFoundError tries the other `types` through the
 * same `read`, so every probe passes the same permission checks as a direct read.
 * Failed probes count as misses, so a forbidden match is never revealed.
 */
export const readWithContentTypeFallback = async <T extends string, R>({
    slug,
    type,
    types,
    read,
}: {
    slug: string;
    type: T;
    types: readonly T[];
    read: (type: T) => Promise<R>;
}): Promise<ContentTypeMatch<T, R>> => {
    try {
        return { value: await read(type), type, note: null };
    } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        const otherTypes = types.filter((other) => other !== type);
        const probes = await Promise.allSettled(
            otherTypes.map(async (other) => ({
                type: other,
                value: await read(other),
            })),
        );
        const matches = probes.flatMap((probe) =>
            probe.status === 'fulfilled' ? [probe.value] : [],
        );
        if (matches.length === 0) throw error;
        if (matches.length > 1) {
            throw new NotFoundError(
                `No ${type} "${slug}" was found, but "${slug}" matches a ${listTypes(
                    matches.map((match) => match.type),
                )}. Retry with one of those types.`,
            );
        }
        const [match] = matches;
        return {
            ...match,
            note: `No ${type} "${slug}" was found; "${slug}" is a ${match.type}, so the ${match.type} was returned. Use type ${match.type} for further calls.`,
        };
    }
};
