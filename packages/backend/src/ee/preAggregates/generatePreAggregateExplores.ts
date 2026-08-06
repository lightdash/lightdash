import {
    InlineErrorType,
    isExploreError,
    preAggregateUtils,
    type Explore,
    type ExploreError,
    type PreAggregateDef,
} from '@lightdash/common';
import { buildPreAggregateExplore } from './buildPreAggregateExplore';

const shouldGeneratePreAggregatesForExplore = (explore: Explore): boolean =>
    explore.name === explore.baseTable;

export const generatePreAggregateExplores = ({
    compiledExplores,
    parsedPreAggregates,
}: {
    compiledExplores: Array<Explore | ExploreError>;
    parsedPreAggregates: PreAggregateDef[];
}): Array<Explore | ExploreError> => {
    if (process.env.PRE_AGGREGATES_ENABLED !== 'true') {
        return compiledExplores;
    }

    if (parsedPreAggregates.length === 0) {
        return compiledExplores;
    }

    return compiledExplores.flatMap<Explore | ExploreError>((compiled) => {
        if (isExploreError(compiled)) {
            return [compiled];
        }
        if (!shouldGeneratePreAggregatesForExplore(compiled)) {
            return [compiled];
        }

        const generatedPreAggregateExplores: Explore[] = [];
        const validPreAggregates: PreAggregateDef[] = [];
        const generationErrors: string[] = [];

        parsedPreAggregates.forEach((preAggregateDef) => {
            try {
                // Resolve deferral entries into the effective definition first;
                // the cached explore and the registry only ever see resolved defs.
                const effectiveDef = preAggregateUtils.resolvePreAggregateDef({
                    sourceExplore: compiled,
                    preAggregateDef,
                });
                generatedPreAggregateExplores.push(
                    buildPreAggregateExplore(compiled, effectiveDef),
                );
                validPreAggregates.push(effectiveDef);
            } catch (error) {
                generationErrors.push(
                    error instanceof Error
                        ? error.message
                        : `Failed to generate pre-aggregate "${preAggregateDef.name}" for explore "${compiled.name}"`,
                );
            }
        });

        if (generationErrors.length === 0) {
            return [
                {
                    ...compiled,
                    preAggregates: validPreAggregates,
                },
                ...generatedPreAggregateExplores,
            ];
        }

        return [
            {
                ...compiled,
                preAggregates: validPreAggregates,
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
