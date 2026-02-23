import {
    InlineErrorType,
    isExploreError,
    type Explore,
    type ExploreError,
} from '../types/explore';
import { type PreAggregateDef } from '../types/preAggregate';
import { buildPreAggregateExplore } from './buildPreAggregateExplore';

const isPreAggregateVirtualExploreGenerationEnabled = (): boolean =>
    process.env.PRE_AGGREGATES_ENABLED === 'true';

export const generatePreAggregateExplores = ({
    compiledExplores,
    parsedPreAggregates,
}: {
    compiledExplores: Array<Explore | ExploreError>;
    parsedPreAggregates: PreAggregateDef[];
}): Array<Explore | ExploreError> => {
    if (
        !isPreAggregateVirtualExploreGenerationEnabled() ||
        parsedPreAggregates.length === 0
    ) {
        return compiledExplores;
    }

    return compiledExplores.flatMap<Explore | ExploreError>((compiled) => {
        if (isExploreError(compiled)) {
            return [compiled];
        }

        const generatedPreAggregateExplores: Explore[] = [];
        const generationErrors: string[] = [];

        parsedPreAggregates.forEach((preAggregateDef) => {
            try {
                generatedPreAggregateExplores.push(
                    buildPreAggregateExplore(compiled, preAggregateDef),
                );
            } catch (error) {
                generationErrors.push(
                    error instanceof Error
                        ? error.message
                        : `Failed to generate pre-aggregate "${preAggregateDef.name}" for explore "${compiled.name}"`,
                );
            }
        });

        if (generationErrors.length === 0) {
            return [compiled, ...generatedPreAggregateExplores];
        }

        return [
            {
                ...compiled,
                warnings: [
                    ...(compiled.warnings || []),
                    ...generationErrors.map((message) => ({
                        type: InlineErrorType.FIELD_ERROR,
                        message,
                    })),
                ],
            },
            ...generatedPreAggregateExplores,
        ];
    });
};
