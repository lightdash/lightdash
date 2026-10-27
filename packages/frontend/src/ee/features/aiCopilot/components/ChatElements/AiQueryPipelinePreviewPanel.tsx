import { type AiComposerChartArtifactConfigV1 } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import {
    useAiAgentMessageQueryPipelines,
    useAiAgentMessageQueryPipelineVizQuery,
} from '../../hooks/useAiAgentMessageQueryPipelines';
import {
    clearPreview,
    type QueryPipelinePreviewData,
} from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiComposerArtifactPanel } from './AiComposerArtifactPanel';

// Message-query pipelines are not saved artifacts, so they can't be pinned.
const NO_CHAT_NODES: ReadonlySet<string> = new Set();

type Props = {
    pipelinePreview: QueryPipelinePreviewData;
};

/** A message's pipeline in the composer panel, as a read-only table. */
export const AiQueryPipelinePreviewPanel: FC<Props> = ({ pipelinePreview }) => {
    const dispatch = useAiAgentStoreDispatch();
    const { projectUuid, agentUuid, threadUuid, messageUuid, nodeId } =
        pipelinePreview;
    const messageRef = { projectUuid, agentUuid, threadUuid, messageUuid };
    const pipelines = useAiAgentMessageQueryPipelines({
        ...messageRef,
        enabled: true,
    });
    // A reused node sits in several pipelines; prefer the one it ends
    const pipeline =
        pipelines.data?.find(
            (candidate) => candidate.terminalNodeId === nodeId,
        ) ??
        pipelines.data?.find((candidate) =>
            candidate.nodes.some((node) => node.nodeId === nodeId),
        );
    const run = useAiAgentMessageQueryPipelineVizQuery({
        ...messageRef,
        queryUuid: pipeline?.queryUuid ?? '',
        enabled: pipeline !== undefined,
    });
    const config = useMemo<AiComposerChartArtifactConfigV1 | null>(
        () =>
            pipeline
                ? {
                      source: 'composer',
                      schemaVersion: 1,
                      queries: pipeline.nodes,
                      terminalNodeId: pipeline.terminalNodeId,
                      vizConfig: null,
                  }
                : null,
        [pipeline],
    );

    if (pipelines.isInitialLoading) {
        return <EmptyStateLoader title="Loading query…" />;
    }
    if (!pipeline || !config) {
        return (
            <InlineErrorState
                message="Could not load this query."
                onRetry={() => void pipelines.refetch()}
            />
        );
    }
    return (
        <AiComposerArtifactPanel
            key={`${pipeline.queryUuid}:${nodeId}`}
            initialFocusedNodeId={nodeId}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            source={{
                kind: 'messageQuery',
                threadUuid,
                messageUuid,
                queryUuid: pipeline.queryUuid,
            }}
            title={pipeline.title}
            description={null}
            config={config}
            run={run.data ?? null}
            runError={run.error ?? null}
            onRerun={() => void run.refetch()}
            onSaveVizConfig={null}
            chatNodeIds={NO_CHAT_NODES}
            onAddToChat={null}
            onClose={() => dispatch(clearPreview())}
        />
    );
};
