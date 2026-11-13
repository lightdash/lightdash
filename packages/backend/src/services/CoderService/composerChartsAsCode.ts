import {
    ChartType,
    ContentAsCodeType,
    currentVersion,
    type ChartAsCodeConfig,
    type ComposerChart,
    type ComposerChartAsCode,
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
        dashboardSlug: string;
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

/** True when uploading `file` would write nothing; the owning dashboard is ignored. */
export const isComposerChartAsCodeUnchanged = (
    file: ComposerChartAsCode,
    current: ComposerChartAsCode,
): boolean =>
    file.name === current.name &&
    (file.description ?? null) === current.description &&
    isEqual(plain(file.pipeline), plain(current.pipeline)) &&
    isEqual(
        plain(withCurrentPin(file.chart, current.chart)),
        plain(current.chart),
    );
