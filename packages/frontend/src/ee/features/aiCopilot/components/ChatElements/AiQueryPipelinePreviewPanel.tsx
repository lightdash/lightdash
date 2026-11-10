import { type AiComposerChartArtifactConfigV1 } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import {
    useAiAgentNodeCitationPipeline,
    useAiAgentNodeCitationVizQuery,
} from '../../hooks/useAiAgentNodeCitations';
import {
    clearPreview,
    type QueryPipelinePreviewData,
} from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiComposerArtifactPanel } from './AiComposerArtifactPanel';

// A cited node is not a saved artifact, so it can't be pinned.
const NO_CHAT_NODES: ReadonlySet<string> = new Set();

type Props = {
    pipelinePreview: QueryPipelinePreviewData;
};

/** A cited node and what it reads in the composer panel, as a read-only table. */
export const AiQueryPipelinePreviewPanel: FC<Props> = ({ pipelinePreview }) => {
    const dispatch = useAiAgentStoreDispatch();
    const getUiString = useUiStrings();
    const { projectUuid, agentUuid, threadUuid, messageUuid, nodeId } =
        pipelinePreview;
    const pipeline = useAiAgentNodeCitationPipeline(pipelinePreview);
    const run = useAiAgentNodeCitationVizQuery({
        ...pipelinePreview,
        enabled: pipeline.data !== undefined,
    });
    const config = useMemo<AiComposerChartArtifactConfigV1 | null>(
        () =>
            pipeline.data
                ? {
                      source: 'composer',
                      schemaVersion: 1,
                      queries: pipeline.data.nodes,
                      terminalNodeId: pipeline.data.nodeId,
                      vizConfig: null,
                  }
                : null,
        [pipeline.data],
    );

    if (pipeline.isInitialLoading) {
        return (
            <EmptyStateLoader
                title={getUiString('aiAgent.nodeCitation.loading')}
            />
        );
    }
    if (!pipeline.data || !config) {
        return (
            <InlineErrorState
                message={getUiString('aiAgent.nodeCitation.loadError')}
                onRetry={() => void pipeline.refetch()}
            />
        );
    }
    return (
        <AiComposerArtifactPanel
            key={`${messageUuid}:${nodeId}`}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            source={{
                kind: 'nodeCitation',
                threadUuid,
                messageUuid,
                nodeId,
            }}
            title={
                pipeline.data.title ??
                getUiString('aiAgent.nodeCitation.untitled')
            }
            description={null}
            isRevision={false}
            config={config}
            run={run.data ?? null}
            runError={run.error ?? null}
            onRerun={() => void run.refetch()}
            onSaveVizConfig={null}
            chatNodeIds={NO_CHAT_NODES}
            onAddToChat={null}
            onClose={() => dispatch(clearPreview())}
            initialView="lineage"
            canSaveToDashboard={false}
            savedDashboardUuid={null}
        />
    );
};
