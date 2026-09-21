import {
    isAiComposerChartArtifactConfig,
    isAiSqlChartArtifactConfig,
    parseVizConfig,
    type AiArtifact,
} from '@lightdash/common';
import { z } from 'zod';

// Persisted tool payloads have no generated filter-rule IDs. Compare these
// instead of parseVizConfig's transformed query, and never strip every `id`:
// merge source IDs and parameter keys can change the meaning of a query.
const stableJson = (value: unknown): string =>
    JSON.stringify(value, (_key, child: unknown) =>
        child && typeof child === 'object' && !Array.isArray(child)
            ? Object.fromEntries(
                  Object.entries(child).sort(([a], [b]) => a.localeCompare(b)),
              )
            : child,
    );

export const getSlackArtifactIdentity = (artifact: AiArtifact): string => {
    const scope = [artifact.threadUuid, artifact.promptUuid];
    if (artifact.chartConfig) {
        const chart = artifact.chartConfig;
        // Keep every query, merge, custom-chart version and presentation slot.
        // Titles/descriptions do not establish (or disprove) equivalence.
        if ('config' in chart) {
            const { title, description, ...config } = chart.config;
            return stableJson([...scope, 'chart', { ...chart, config }]);
        }
        return stableJson([...scope, 'chart', chart]);
    }
    if (artifact.dashboardConfig) {
        return stableJson([...scope, 'dashboard', artifact.artifactUuid]);
    }
    return stableJson([...scope, 'version', artifact.versionUuid]);
};

const getLegacySlackArtifactIdentity = (
    targetArtifact: AiArtifact,
    maxQueryLimit: number,
): string => {
    const vizTypeSchema = z.object({
        chartConfig: z
            .object({ defaultVizType: z.string() })
            .nullable()
            .optional(),
    });
    const getChartVizType = (artifact: AiArtifact): string => {
        if (!artifact.chartConfig) {
            return 'chart';
        }
        if (
            isAiSqlChartArtifactConfig(artifact.chartConfig) ||
            isAiComposerChartArtifactConfig(artifact.chartConfig)
        ) {
            return 'table';
        }
        const parsed = vizTypeSchema.safeParse(artifact.chartConfig.config);
        if (parsed.success && parsed.data.chartConfig?.defaultVizType) {
            return parsed.data.chartConfig.defaultVizType;
        }
        return (
            parseVizConfig(artifact.chartConfig.config, maxQueryLimit)?.type ??
            'chart'
        );
    };

    // Identity of a chart within a turn: viz type + title. A retry keeps both
    // (even when it tweaks the query, e.g. day -> month), so retries collapse;
    // a line and a bar of the same data differ in viz type, and different
    // charts differ in title, so both stay separate. Untitled charts fall back
    // to their query so they don't all collapse together.
    const getArtifactIdentity = (artifact: AiArtifact): string => {
        const title = artifact.title?.trim();
        if (artifact.chartConfig) {
            const vizType = getChartVizType(artifact);
            if (title) return `chart:${vizType}:${title}`;
            if (isAiSqlChartArtifactConfig(artifact.chartConfig)) {
                return `chart:${vizType}:${artifact.chartConfig.sql}`;
            }
            if (isAiComposerChartArtifactConfig(artifact.chartConfig)) {
                return `chart:${vizType}:${artifact.chartConfig.lastQueryUuid}`;
            }
            const viz = parseVizConfig(
                artifact.chartConfig.config,
                maxQueryLimit,
            );
            const query = viz
                ? JSON.stringify(
                      { type: viz.type, metricQuery: viz.metricQuery },
                      (key, value) => (key === 'id' ? undefined : value),
                  )
                : artifact.versionUuid;
            return `chart:${vizType}:${query}`;
        }
        if (artifact.dashboardConfig) {
            return title
                ? `dashboard:${title}`
                : `dashboard:${JSON.stringify(artifact.dashboardConfig)}`;
        }
        return `version:${artifact.versionUuid}`;
    };

    return getArtifactIdentity(targetArtifact);
};

export const deduplicateSlackArtifacts = (
    artifacts: AiArtifact[],
    legacyMaxQueryLimit?: number,
): AiArtifact[] => {
    const latest = new Map<string, AiArtifact>();
    for (const artifact of artifacts) {
        const identity =
            legacyMaxQueryLimit === undefined
                ? getSlackArtifactIdentity(artifact)
                : getLegacySlackArtifactIdentity(artifact, legacyMaxQueryLimit);
        const previous = latest.get(identity);
        if (
            !previous ||
            (legacyMaxQueryLimit !== undefined ||
            artifact.artifactUuid === previous.artifactUuid
                ? artifact.versionNumber > previous.versionNumber
                : artifact.versionCreatedAt > previous.versionCreatedAt)
        ) {
            latest.set(identity, artifact);
        }
    }
    return [...latest.values()];
};

/** Legacy results have no artifact-version attribution. Only map by position
 * when counts align, or use the last render when every version is equivalent.
 * Ambiguous results must not display another chart's image. */
export const getLegacySlackArtifactImage = (
    artifact: AiArtifact,
    originalCharts: AiArtifact[],
    imageUrls: string[],
): string | undefined => {
    if (originalCharts.length === imageUrls.length) {
        return imageUrls[
            originalCharts.findIndex(
                (chart) => chart.versionUuid === artifact.versionUuid,
            )
        ];
    }
    const identity = getSlackArtifactIdentity(artifact);
    if (
        originalCharts.length > 0 &&
        originalCharts.every(
            (chart) => getSlackArtifactIdentity(chart) === identity,
        )
    ) {
        return imageUrls.at(-1);
    }
    return undefined;
};
