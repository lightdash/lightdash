import { parseMemoryCitations } from './memoryCitation';

type CitedMemory = { memoryId: string; slug: string };

export type CitationTelemetryArgs = {
    response: string;
    promptUuid: string;
    /** Gates the memory tier only; context citations always count. */
    memoryEnabled: boolean;
    /** Returns null when there is no memory owner to attribute citations to. */
    incrementMemoryCited: (slugs: string[]) => Promise<CitedMemory[] | null>;
    onMemoryCited: (
        cited: CitedMemory[],
        citationCounts: Record<string, number>,
    ) => void;
    /** Returns the number of context entry rows updated. */
    incrementContextCited: (slugs: string[]) => Promise<number>;
    logger: {
        warn(message: string): void;
        error(message: string, error: unknown): void;
    };
};

// Response-update citation telemetry: memory increments are memory-gated and
// owner-scoped; project-context increments work with the memory setting off.
export const recordCitationTelemetry = async (
    args: CitationTelemetryArgs,
): Promise<void> => {
    const { memory, context, malformedCount } = parseMemoryCitations(
        args.response,
    );

    if (malformedCount > 0) {
        args.logger.warn(
            `Dropped ${malformedCount} malformed citation marker(s) for prompt ${args.promptUuid}`,
        );
    }

    if (args.memoryEnabled && memory.slugs.length > 0) {
        try {
            const cited = await args.incrementMemoryCited(memory.slugs);
            if (cited !== null) {
                const citedSlugs = new Set(cited.map(({ slug }) => slug));
                const dropped = memory.slugs.filter(
                    (slug) => !citedSlugs.has(slug),
                );
                if (dropped.length > 0) {
                    args.logger.warn(
                        `Dropped ${dropped.length} unknown or inactive memory citation(s) for prompt ${args.promptUuid}`,
                    );
                }
                if (cited.length > 0) {
                    args.onMemoryCited(cited, memory.citationCounts);
                }
            }
        } catch (error) {
            args.logger.error(
                `Failed to update memory citation telemetry for prompt ${args.promptUuid}`,
                error,
            );
        }
    }

    if (context.slugs.length > 0) {
        try {
            const updated = await args.incrementContextCited(context.slugs);
            if (updated < context.slugs.length) {
                args.logger.warn(
                    `Dropped ${
                        context.slugs.length - updated
                    } unknown or inactive project-context citation(s) for prompt ${args.promptUuid}`,
                );
            }
        } catch (error) {
            args.logger.error(
                `Failed to update project-context citation telemetry for prompt ${args.promptUuid}`,
                error,
            );
        }
    }
};
