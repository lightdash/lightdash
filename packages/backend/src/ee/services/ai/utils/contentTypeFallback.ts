import { NotFoundError, ParameterError } from '@lightdash/common';

/**
 * Reads `slug` as `type`; on NotFoundError probes the other `types` through the same `read`.
 * A probe that throws is a miss, so it never reveals content a direct read would refuse.
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
}): Promise<{ value: R; type: T }> => {
    try {
        return { value: await read(type), type };
    } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        const probes = await Promise.allSettled(
            types
                .filter((other) => other !== type)
                .map(async (other) => ({
                    value: await read(other),
                    type: other,
                })),
        );
        const matches = probes.flatMap((probe) =>
            probe.status === 'fulfilled' ? [probe.value] : [],
        );
        if (matches.length === 0) throw error;
        if (matches.length > 1) {
            throw new ParameterError(
                `No ${type} "${slug}" was found, and "${slug}" matches more than one type: ${matches
                    .map((match) => match.type)
                    .join(', ')}. Retry with one of those types.`,
            );
        }
        return matches[0];
    }
};
