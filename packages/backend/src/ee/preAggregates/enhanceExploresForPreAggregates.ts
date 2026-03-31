import {
    Explore,
    ExploreError,
    ExploreType,
    isExploreError,
} from '@lightdash/common';
import { generatePreAggregateExplores } from './generatePreAggregateExplores';

export const enhanceExploresForPreAggregates = ({
    explores,
    enabled,
}: {
    explores: (Explore | ExploreError)[];
    enabled: boolean;
}): (Explore | ExploreError)[] => {
    if (!enabled) {
        return explores;
    }

    const existingExploreNames = new Set<string>(
        explores
            .filter((explore): explore is Explore => !isExploreError(explore))
            .map((explore) => explore.name),
    );

    return explores.flatMap((explore) => {
        if (
            isExploreError(explore) ||
            !explore.preAggregates ||
            explore.preAggregates.length === 0 ||
            explore.type === ExploreType.PRE_AGGREGATE
        ) {
            return [explore];
        }

        const generatedExplores = generatePreAggregateExplores({
            compiledExplores: [explore],
            parsedPreAggregates: explore.preAggregates,
        });

        const enhancedSourceExplore =
            generatedExplores.find(
                (generatedExplore) => generatedExplore.name === explore.name,
            ) ?? explore;

        const generatedPreAggregateExplores = generatedExplores.filter(
            (generatedExplore) => generatedExplore.name !== explore.name,
        );

        const dedupedGeneratedPreAggregateExplores =
            generatedPreAggregateExplores.filter((generatedExplore) => {
                if (isExploreError(generatedExplore)) {
                    return true;
                }

                if (existingExploreNames.has(generatedExplore.name)) {
                    return false;
                }

                existingExploreNames.add(generatedExplore.name);
                return true;
            });

        return [enhancedSourceExplore, ...dedupedGeneratedPreAggregateExplores];
    });
};
