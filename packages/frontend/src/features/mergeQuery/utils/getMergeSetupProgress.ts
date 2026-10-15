import i18n from '../../../i18n/i18n';

const ns = 'mergeQuery';

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
            title: i18n.t('setupProgress.chooseTable.title', { ns }),
            description: i18n.t('setupProgress.chooseTable.description', {
                ns,
            }),
        };
    }
    if (dimensionCount === 0 || metricCount === 0) {
        return {
            step: 2,
            title: i18n.t('setupProgress.selectFields.title', { ns }),
            description:
                dimensionCount === 0 && metricCount === 0
                    ? i18n.t('setupProgress.selectFields.metricAndDimension', {
                          ns,
                      })
                    : dimensionCount === 0
                      ? i18n.t('setupProgress.selectFields.dimension', { ns })
                      : i18n.t('setupProgress.selectFields.metric', { ns }),
        };
    }
    if (!hasJoin) {
        return {
            step: 3,
            title: i18n.t('setupProgress.matchQueries.title', { ns }),
            description: i18n.t('setupProgress.matchQueries.description', {
                ns,
            }),
        };
    }
    return {
        step: 4,
        title: i18n.t('setupProgress.review.title', { ns }),
        description: i18n.t('setupProgress.review.description', { ns }),
    };
};
