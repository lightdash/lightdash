import {
    InlineErrorType,
    isExploreError,
    type Explore,
    type ExploreError,
    type PreAggregateDef,
    type WeekDay,
} from '@lightdash/common';
import { buildPreAggregateExplore } from './buildPreAggregateExplore';

const shouldGeneratePreAggregatesForExplore = (explore: Explore): boolean =>
    explore.name === explore.baseTable;

export const generatePreAggregateExplores = ({
    compiledExplores,
    parsedPreAggregates,
    startOfWeek,
}: {
    compiledExplores: Array<Explore | ExploreError>;
    parsedPreAggregates: PreAggregateDef[];
    startOfWeek: WeekDay | null;
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
                generatedPreAggregateExplores.push(
                    buildPreAggregateExplore(
                        compiled,
                        preAggregateDef,
                        startOfWeek,
                    ),
                );
                validPreAggregates.push(preAggregateDef);
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
