import type { Explore, ExploreError } from '../types/explore';
import { isExploreError } from '../types/explore';
import { getDimensions, getMetrics } from '../utils/fields';

export type CompilationHistoryReport = {
    totalExploresCount: number;
    successfulExploresCount: number;
    errorExploresCount: number;
    metricsCount: number;
    dimensionsCount: number;
    exploresWithErrors: ExploreError[];
    baseTableNames: string[];
};

export type ExploreWarningSummary = Pick<Explore, 'name'> & {
    warnings: NonNullable<Explore['warnings']>;
};

export type ExploreWarningReport = {
    warningCount: number;
    warningExploreCount: number;
    exploresWithWarnings: ExploreWarningSummary[];
};

export const calculateCompilationReport = (args: {
    explores: (Explore | ExploreError)[];
}): CompilationHistoryReport => {
    const exploresWithErrors: ExploreError[] = [];
    const baseTableNames: string[] = [];
    let successfulExploresCount = 0;
    let metricsCount = 0;
    let dimensionsCount = 0;

    args.explores.forEach((explore) => {
        if (isExploreError(explore)) {
            exploresWithErrors.push(explore);
        } else {
            successfulExploresCount += 1;
            baseTableNames.push(explore.baseTable);

            const metrics = getMetrics(explore);
            const dimensions = getDimensions(explore);

            metricsCount += metrics.length;
            dimensionsCount += dimensions.length;
        }
    });

    return {
        totalExploresCount: args.explores.length,
        successfulExploresCount,
        errorExploresCount: exploresWithErrors.length,
        metricsCount,
        dimensionsCount,
        exploresWithErrors,
        baseTableNames,
    };
};

export const calculateExploreWarningReport = (args: {
    explores: (Explore | ExploreError)[];
}): ExploreWarningReport => {
    const exploresWithWarnings = args.explores.flatMap<ExploreWarningSummary>(
        (explore) => {
            if (isExploreError(explore) || !explore.warnings?.length) {
                return [];
            }

            return [
                {
                    name: explore.name,
                    warnings: explore.warnings,
                },
            ];
        },
    );

    return {
        warningCount: exploresWithWarnings.reduce(
            (count, explore) => count + explore.warnings.length,
            0,
        ),
        warningExploreCount: exploresWithWarnings.length,
        exploresWithWarnings,
    };
};
