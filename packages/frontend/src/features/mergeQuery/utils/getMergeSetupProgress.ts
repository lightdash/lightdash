export type MergeSetupProgress = {
    step: 1 | 2 | 3 | 4;
    title: string;
    description: string;
};

export const getMergeSetupProgress = ({
    hasExplore,
    dimensionCount,
    metricCount,
    hasJoin,
}: {
    hasExplore: boolean;
    dimensionCount: number;
    metricCount: number;
    hasJoin: boolean;
}): MergeSetupProgress => {
    if (!hasExplore) {
        return {
            step: 1,
            title: 'Choose a table',
            description: 'Pick the data you want to combine with this query.',
        };
    }
    if (dimensionCount === 0 || metricCount === 0) {
        return {
            step: 2,
            title: 'Select fields',
            description:
                dimensionCount === 0 && metricCount === 0
                    ? 'Add a metric and a dimension to match on.'
                    : dimensionCount === 0
                      ? 'Add a dimension to match on.'
                      : 'Add at least one metric.',
        };
    }
    if (!hasJoin) {
        return {
            step: 3,
            title: 'Match the queries',
            description: 'Choose corresponding fields in the relationship.',
        };
    }
    return {
        step: 4,
        title: 'Review the relationship',
        description: 'Check what to keep, then run the merged query.',
    };
};
