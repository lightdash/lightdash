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
    /** The dashboard this chart belongs to; null or omitted when it belongs to a space. Uploads do not change an existing chart's dashboard, and cannot move a chart between a dashboard and a space. */
    dashboardSlug?: string | null;
    /** The space this chart belongs to, or the space of its dashboard. Uploads create a missing space or dashboard there. Changing it moves a chart that belongs to a space. */
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
