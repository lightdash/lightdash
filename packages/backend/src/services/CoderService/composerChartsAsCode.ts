import {
    assertUnreachable,
    ChartType,
    ContentAsCodeType,
    currentVersion,
    getLtreePathFromContentAsCodePath,
    NotSupportedError,
    ParameterError,
    type ChartAsCodeConfig,
    type ComposerChart,
    type ComposerChartAsCode,
    type ComposerChartOwner,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';

/** The stored chart verbatim; only a custom chart type uuid becomes its slug. */
export const toComposerChartAsCode = (
    chart: ComposerChart,
    {
        dashboardSlug,
        spaceSlug,
        dataAppVizSlugByUuid,
    }: {
        dashboardSlug: string | null;
        spaceSlug: string;
        dataAppVizSlugByUuid: ReadonlyMap<string, string>;
    },
): ComposerChartAsCode => {
    const { chartConfig } = chart.chart;
    let portableConfig: ChartAsCodeConfig = chartConfig;
    if (chartConfig.type === ChartType.DATA_APP_VIZ && chartConfig.config) {
        const { dataAppVizUuid, ...config } = chartConfig.config;
        const dataAppVizSlug = dataAppVizSlugByUuid.get(dataAppVizUuid);
        // A deleted type keeps its uuid, so the file still round-trips here
        if (dataAppVizSlug !== undefined) {
            portableConfig = {
                type: ChartType.DATA_APP_VIZ,
                config: { ...config, dataAppVizSlug },
            };
        }
    }
    return {
        contentType: ContentAsCodeType.COMPOSER_CHART,
        version: currentVersion,
        slug: chart.slug,
        name: chart.name,
        description: chart.description,
        dashboardSlug,
        spaceSlug,
        pipeline: chart.pipeline,
        chart: { ...chart.chart, chartConfig: portableConfig },
        updatedAt: chart.updatedAt,
        downloadedAt: new Date(),
    };
};

// As YAML holds it: undefined keys gone
const plain = (value: unknown): unknown =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/** A file omitting the type version means the version the chart holds. */
const withCurrentPin = (
    file: ComposerChartAsCode['chart'],
    current: ComposerChartAsCode['chart'],
): ComposerChartAsCode['chart'] => {
    const fileConfig = file.chartConfig;
    const currentConfig = current.chartConfig;
    if (
        fileConfig.type !== ChartType.DATA_APP_VIZ ||
        currentConfig.type !== ChartType.DATA_APP_VIZ ||
        !fileConfig.config ||
        fileConfig.config.dataAppVizVersion !== undefined
    ) {
        return file;
    }
    return {
        ...file,
        chartConfig: {
            ...fileConfig,
            config: {
                ...fileConfig.config,
                dataAppVizVersion: currentConfig.config?.dataAppVizVersion,
            },
        },
    };
};

/** Slugs naming one space path, as `sales_ops` and `sales-ops` do. */
export const isSameSpaceSlug = (a: string, b: string): boolean =>
    getLtreePathFromContentAsCodePath(a) ===
    getLtreePathFromContentAsCodePath(b);

/** True when uploading `file` over `current`, as downloaded, writes nothing. A dashboard chart ignores the file's dashboard and space; a space chart compares its space. */
export const isComposerChartAsCodeUnchanged = (
    file: ComposerChartAsCode,
    current: ComposerChartAsCode,
): boolean =>
    (current.dashboardSlug !== null ||
        isSameSpaceSlug(file.spaceSlug, current.spaceSlug)) &&
    file.name === current.name &&
    (file.description ?? null) === current.description &&
    isEqual(plain(file.pipeline), plain(current.pipeline)) &&
    isEqual(
        plain(withCurrentPin(file.chart, current.chart)),
        plain(current.chart),
    );

/** First published CLI that uploads composer chart files. */
const COMPOSER_CHART_MIN_CLI_VERSION = '3.266.0';

/** A CLI predating composer charts sends their files to the classic chart route. */
export const assertNotComposerChartFile = (slug: string, body: unknown) => {
    if (
        typeof body === 'object' &&
        body !== null &&
        'contentType' in body &&
        body.contentType === ContentAsCodeType.COMPOSER_CHART
    ) {
        throw new ParameterError(
            `Chart "${slug}" is a composer chart file. Upgrade your CLI to ${COMPOSER_CHART_MIN_CLI_VERSION} or later to upload composer charts.`,
        );
    }
};

/** A file cannot switch a chart between a dashboard and a space. */
export class ComposerChartOwnerChangeError extends NotSupportedError {}

/** The owner type `existing` has must be the one the file names; a deleted chart included. */
export const assertComposerChartOwnerTypeKept = (
    slug: string,
    existing: ComposerChartOwner,
    fileDashboardSlug: string | null,
): void => {
    switch (existing.type) {
        case 'dashboard':
            if (fileDashboardSlug !== null) return;
            throw new ComposerChartOwnerChangeError(
                `Composer chart "${slug}" belongs to a dashboard. An upload cannot move a chart from a dashboard to a space, so the file must keep its dashboardSlug.`,
            );
        case 'space':
            if (fileDashboardSlug === null) return;
            throw new ComposerChartOwnerChangeError(
                `Composer chart "${slug}" belongs to a space. You cannot move it to dashboard "${fileDashboardSlug}" by uploading a file. Remove dashboardSlug to keep it in a space. Change spaceSlug to move it between spaces.`,
            );
        default:
            return assertUnreachable(existing, 'Unknown composer chart owner');
    }
};
