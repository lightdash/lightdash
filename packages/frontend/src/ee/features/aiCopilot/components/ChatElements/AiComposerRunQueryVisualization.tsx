import {
    FeatureFlags,
    getComposerRunQueryChart,
    toComposerResultRows,
    type ApiAiAgentComposerArtifactChartStage,
    type ComposerCustomChartTypeSlot,
    type ComposerRunQueryChart,
    type ComposerStoredChartVizConfig,
} from '@lightdash/common';
import { Box, Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, type FC, type ReactNode } from 'react';
import { useDataAppVizRenderMetadata } from '../../../../../features/chartTypes/hooks/useDataAppVizRender';
import {
    useInfiniteQueryResults,
    type InfiniteQueryResults,
} from '../../../../../hooks/useQueryResults';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { getAiAgentArtifactResultsUrl } from '../../hooks/aiAgentRouting';
import { AiComposerRunQueryChart } from './AiComposerRunQueryChart';

const DATA_APP_VIZ_RENDER_TARGET = {
    isEmbedded: false,
    savedChartUuid: undefined,
};

type Props = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    /** The presented node's result in this run; its columns type the chart. */
    nodeResults: InfiniteQueryResults;
    /** The series split stage the server ran over that result; null without a split. */
    chartStage: ApiAiAgentComposerArtifactChartStage | null;
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
    headerContent?: ReactNode;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

// A composer node result drawn by the runQuery chart builders, read-only.
export const AiComposerRunQueryVisualization: FC<Props> = ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    nodeResults,
    chartStage,
    vizConfig,
    metadata,
    headerContent,
    onScreenshotReady,
    onScreenshotError,
}) => {
    const columns = useMemo(
        () => Object.values(nodeResults.columns ?? {}),
        [nodeResults.columns],
    );
    const customChartType = vizConfig.type === 'custom' ? vizConfig : null;
    const { data: renderMetadata } = useDataAppVizRenderMetadata(
        projectUuid,
        customChartType?.dataAppVizUuid ?? null,
        DATA_APP_VIZ_RENDER_TARGET,
        customChartType?.dataAppVizVersion ?? undefined,
    );
    const slots = useMemo(
        (): ComposerCustomChartTypeSlot[] | null =>
            renderMetadata?.state === 'ready'
                ? renderMetadata.schema.fields
                : null,
        [renderMetadata],
    );

    const chart = useMemo((): ComposerRunQueryChart | Error | null => {
        if (columns.length === 0) return null;
        if (customChartType && slots === null) return null;
        try {
            return getComposerRunQueryChart({
                columns,
                vizConfig,
                metadata,
                customChartTypeSlots: slots ?? [],
            });
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    }, [columns, customChartType, slots, vizConfig, metadata]);
    const readyChart = chart instanceof Error ? null : chart;
    const stage = chartStage !== null;

    const isEmbed = useIsEmbedded();
    const identityFlag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const identityEnabled = identityFlag.data?.enabled === true;
    const stageQueryUuid =
        chartStage?.status === 'ok' ? chartStage.queryUuid : undefined;
    const stageResults = useInfiniteQueryResults(
        projectUuid,
        isEmbed || !identityFlag.isLoading ? stageQueryUuid : undefined,
        undefined,
        identityEnabled && !isEmbed && stageQueryUuid
            ? getAiAgentArtifactResultsUrl({
                  projectUuid,
                  agentUuid,
                  artifactUuid,
                  versionUuid,
                  queryUuid: stageQueryUuid,
                  cached: false,
              })
            : null,
    );
    // Without a split the chart reads the node result, renamed in memory.
    const results = stage ? stageResults : nodeResults;

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    const errorMessage =
        chartStage?.status === 'error'
            ? chartStage.message
            : chart instanceof Error
              ? chart.message
              : renderMetadata?.state === 'unavailable'
                ? 'Custom chart type bundle is unavailable'
                : (results.error?.error.message ?? null);
    useEffect(() => {
        if (errorMessage) onScreenshotError?.();
    }, [errorMessage, onScreenshotError]);

    const rows = useMemo(
        () =>
            readyChart && !stage
                ? toComposerResultRows(readyChart, results.rows)
                : results.rows,
        [results.rows, readyChart, stage],
    );

    const body = (() => {
        if (errorMessage) {
            return (
                <Center h="100%">
                    <Text size="sm" c="red">
                        {errorMessage}
                    </Text>
                </Center>
            );
        }
        if (!readyChart || !results.hasFetchedAllRows) {
            return (
                <Center h="100%">
                    <Loader type="dots" />
                </Center>
            );
        }
        return (
            <AiComposerRunQueryChart
                projectUuid={projectUuid}
                chart={readyChart}
                results={results}
                rows={rows}
                onScreenshotReady={onScreenshotReady}
                onScreenshotError={onScreenshotError}
            />
        );
    })();

    if (headerContent === undefined) return body;
    return (
        <Stack gap="md" h="100%" mih={0}>
            {headerContent}
            <Box flex={1} mih={0} px="md" pb="md">
                {body}
            </Box>
        </Stack>
    );
};
