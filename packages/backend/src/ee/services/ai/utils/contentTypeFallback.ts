import {
    LightdashError,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';

// Absent or refused; anything else leaves the probe's answer unknown.
const isClientError = (probeError: unknown) =>
    probeError instanceof LightdashError && probeError.statusCode < 500;

/**
 * Reads `slug` as `type`; on NotFoundError probes the other `types` through the same `read`.
 * A refused probe is a miss, so it never reveals content a direct read would refuse.
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
        const unknown = probes.some(
            (probe) =>
                probe.status === 'rejected' && !isClientError(probe.reason),
        );
        if (matches.length === 0 || (matches.length === 1 && unknown)) {
            throw error;
        }
        if (matches.length > 1) {
            throw new ParameterError(
                `No ${type} "${slug}" could be read, and "${slug}" matches more than one type: ${matches
                    .map((match) => match.type)
                    .join(', ')}. Retry with one of those types.`,
            );
        }
        return matches[0];
    }
};
