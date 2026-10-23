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

type Props = {
    pipelinePreview: QueryPipelinePreviewData;
};

/** A message's pipeline in the composer panel, as a read-only table. */
export const AiQueryPipelinePreviewPanel: FC<Props> = ({ pipelinePreview }) => {
    const dispatch = useAiAgentStoreDispatch();
    const { projectUuid, agentUuid, threadUuid, messageUuid, queryUuid } =
        pipelinePreview;
    const pipelines = useAiAgentMessageQueryPipelines({
        projectUuid,
        agentUuid,
        threadUuid,
        messageUuid,
        enabled: true,
    });
    const run = useAiAgentMessageQueryPipelineVizQuery(pipelinePreview);
    const pipeline = pipelines.data?.find(
        (candidate) => candidate.queryUuid === queryUuid,
    );
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
            key={queryUuid}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            source={{
                kind: 'messageQuery',
                threadUuid,
                messageUuid,
                queryUuid,
            }}
            title={pipeline.title}
            description={null}
            config={config}
            run={run.data ?? null}
            runError={run.error ?? null}
            onRerun={() => void run.refetch()}
            onSaveVizConfig={null}
            onClose={() => dispatch(clearPreview())}
        />
    );
};
