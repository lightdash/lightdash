import type {
    ComposerChartPipeline,
    ComposerStoredChart,
} from '../../composer/composerChart';
import type { PromotionAction } from '../promotion';
import type { ChartAsCodeConfig } from './charts';
import type { ContentAsCodeType } from './core';

/** The stored chart, with a custom chart type named by its portable slug. */
export type ComposerStoredChartAsCode = Omit<
    ComposerStoredChart,
    'chartConfig'
> & {
    chartConfig: ChartAsCodeConfig;
};

/** A composer chart file: the stored pipeline and chart, verbatim. */
export type ComposerChartAsCode = {
    contentType: ContentAsCodeType.COMPOSER_CHART;
    version: number;
    slug: string;
    name: string;
    description: string | null;
    /** The owning dashboard. Ignored on upload when the chart already exists. */
    dashboardSlug: string;
    /** Only used to create a placeholder dashboard when dashboardSlug names none. */
    spaceSlug: string;
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChartAsCode;
    updatedAt?: Date;
    downloadedAt?: Date;
};

export type ApiComposerChartAsCodeListResponse = {
    status: 'ok';
    results: {
        composerCharts: ComposerChartAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    };
};

export type ApiComposerChartAsCodeUpsertResponse = {
    status: 'ok';
    results: { action: PromotionAction; composerChartUuid: string };
};
