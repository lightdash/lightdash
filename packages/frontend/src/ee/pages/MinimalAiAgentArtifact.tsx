import { isAiAgentSqlArtifactVizQuery } from '@lightdash/common';
import { Center, Text } from '@mantine/core';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useParams } from 'react-router';
import ScreenshotProgressIndicator from '../../components/common/ScreenshotProgressIndicator';
import ScreenshotReadyIndicator from '../../components/common/ScreenshotReadyIndicator';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useInfiniteQueryResults } from '../../hooks/useQueryResults';
import { AiVisualizationRenderer } from '../features/aiCopilot/components/ChatElements/AiVisualizationRenderer';
import { useAiAgentArtifact } from '../features/aiCopilot/hooks/useAiAgentArtifacts';
import { getAiArtifactChartSource } from '../features/aiCopilot/hooks/useAiArtifactChart';
import { useAiAgentArtifactVizQuery } from '../features/aiCopilot/hooks/useProjectAiAgents';

// Minimal render of a custom chart type artifact version for headless
// capture: web-thread derivation/renderer, interactions structurally off.
const MinimalAiAgentArtifact: FC = () => {
    const { agentUuid, artifactUuid, versionUuid } = useParams<{
        agentUuid: string;
        artifactUuid: string;
        versionUuid: string;
    }>();
    const projectUuid = useProjectUuid();
    const artifactRef = {
        projectUuid: projectUuid!,
        agentUuid: agentUuid!,
        artifactUuid: artifactUuid!,
        versionUuid: versionUuid!,
    };

    // White page background for screenshot exports, regardless of theme
    useEffect(() => {
        document.documentElement.style.backgroundColor = 'white';
        document.body.style.backgroundColor = 'white';
    }, []);

    const {
        data: artifactData,
        isLoading: isArtifactLoading,
        error: artifactError,
    } = useAiAgentArtifact(artifactRef);

    const { semanticChartConfig, customChartType } = getAiArtifactChartSource(
        artifactData?.chartConfig,
    );

    const vizQueryHandle = useAiAgentArtifactVizQuery(artifactRef, {
        enabled: customChartType !== null,
    });
    const vizQueryData =
        vizQueryHandle.data &&
        !isAiAgentSqlArtifactVizQuery(vizQueryHandle.data)
            ? vizQueryHandle.data
            : undefined;

    const queryResults = useInfiniteQueryResults(
        projectUuid,
        vizQueryData?.query.queryUuid,
    );

    const [isScreenshotReady, setIsScreenshotReady] = useState(false);
    const [hasRendererError, setHasRendererError] = useState(false);
    const handleScreenshotReady = useCallback(
        () => setIsScreenshotReady(true),
        [],
    );
    const handleScreenshotError = useCallback(() => {
        setHasRendererError(true);
        setIsScreenshotReady(true);
    }, []);

    if (!projectUuid || !agentUuid || !artifactUuid || !versionUuid) {
        return null;
    }

    const isUnsupportedArtifact =
        !isArtifactLoading && !artifactError && artifactData
            ? customChartType === null
            : false;
    const hasLoadError =
        !!artifactError ||
        isUnsupportedArtifact ||
        !!vizQueryHandle.error ||
        !!queryResults.error;
    // Renderer errors keep the (terminal) frame mounted but mark it errored.
    const hasError = hasLoadError || hasRendererError;
    const readyTileUuids = isScreenshotReady && !hasError ? [versionUuid] : [];
    const erroredTileUuids = hasError ? [versionUuid] : [];

    // Same gate as the web thread's artifact panel: mount the renderer only
    // once the viz query and all result rows are in.
    const isReadyToRender =
        !hasLoadError &&
        !!vizQueryData &&
        !!semanticChartConfig &&
        !!customChartType &&
        !queryResults.isFetchingRows;

    return (
        <>
            <ScreenshotProgressIndicator
                expectedTileUuids={[versionUuid]}
                readyTileUuids={readyTileUuids}
                erroredTileUuids={erroredTileUuids}
            />

            {isReadyToRender ? (
                <AiVisualizationRenderer
                    vizQueryData={vizQueryData}
                    results={queryResults}
                    chartConfig={semanticChartConfig}
                    customChartType={customChartType}
                    selectedChartType={null}
                    displayFields={false}
                    displayFilters={false}
                    loadExplore={false}
                    interactionMode="read-only"
                    minimal
                    onScreenshotReady={handleScreenshotReady}
                    onScreenshotError={handleScreenshotError}
                />
            ) : hasLoadError ? (
                <Center h="100%">
                    <Text size="sm" c="dimmed" ta="center">
                        {isUnsupportedArtifact
                            ? 'This artifact is not a custom chart type answer.'
                            : 'Failed to load artifact visualization.'}
                    </Text>
                </Center>
            ) : null}

            {(isScreenshotReady || hasError) && (
                <ScreenshotReadyIndicator
                    tilesTotal={1}
                    tilesReady={readyTileUuids.length}
                    tilesErrored={erroredTileUuids.length}
                />
            )}
        </>
    );
};

export default MinimalAiAgentArtifact;
