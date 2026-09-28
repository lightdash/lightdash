import {
    assertUnreachable,
    type AiAgentToolResult,
    type AiArtifact,
} from '@lightdash/common';
import { z } from 'zod';
import { isSlackTableArtifact } from './slackTablePreviews';

const generatedChartMetadataSchema = z.object({
    status: z.literal('success'),
    artifactVersionUuid: z.string().min(1),
});

const isSelectableChartArtifact = (artifact: AiArtifact): boolean => {
    if (artifact.artifactType !== 'chart' || !artifact.chartConfig) {
        return false;
    }
    const { chartConfig } = artifact;
    switch (chartConfig.source) {
        case 'semantic':
        case 'merge':
        case 'customChartType':
            return !isSlackTableArtifact(artifact);
        case 'sql':
        case 'composer':
            return false;
        default:
            return assertUnreachable(chartConfig, 'Unknown chart source');
    }
};

/** Only chart versions explicitly selected by the final answer become cards.
 * Other artifact kinds preserve their delivery behavior and original order. */
export const getSlackSelectedCardArtifacts = ({
    artifacts,
    toolResults,
    selectedVersionUuids,
    canShowInlineTables,
}: {
    artifacts: AiArtifact[];
    toolResults: Array<
        Pick<AiAgentToolResult, 'toolType' | 'toolCallId' | 'toolName'> & {
            metadata: unknown;
        }
    >;
    selectedVersionUuids: string[];
    canShowInlineTables: boolean;
}): AiArtifact[] => {
    const successfulVersions = new Set(
        toolResults.flatMap((result) => {
            if (
                result.toolType !== 'built-in' ||
                !['runQuery', 'generateVisualization'].includes(result.toolName)
            ) {
                return [];
            }
            const metadata = generatedChartMetadataSchema.safeParse(
                result.metadata,
            );
            return metadata.success ? [metadata.data.artifactVersionUuid] : [];
        }),
    );
    const selectableArtifacts = new Map(
        artifacts
            .filter(isSelectableChartArtifact)
            .map((artifact) => [artifact.versionUuid, artifact]),
    );
    const selectedCharts = [...new Set(selectedVersionUuids)]
        .flatMap((versionUuid) => {
            const artifact = selectableArtifacts.get(versionUuid);
            return artifact && successfulVersions.has(versionUuid)
                ? [artifact]
                : [];
        })
        .slice(0, 10);
    const otherArtifacts = artifacts.filter(
        (artifact) =>
            !isSelectableChartArtifact(artifact) &&
            (!canShowInlineTables ||
                artifact.artifactType !== 'chart' ||
                !isSlackTableArtifact(artifact)),
    );
    return [...selectedCharts, ...otherArtifacts];
};
