import {
    type ComposerChartPipeline,
    type ComposerChartRunResults,
} from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { ComposerNodeResultTable } from '../../../ee/features/aiCopilot/components/ChatElements/AiComposerNodeResult';
import { AiComposerLineage } from '../../../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerLineage';
import { useComposerRunNodeStatuses } from '../../../ee/features/aiCopilot/components/ChatElements/useComposerRunNodeStatuses';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';

const NodeRows: FC<{ projectUuid: string; queryUuid: string }> = ({
    projectUuid,
    queryUuid,
}) => {
    const results = useInfiniteQueryResults(
        projectUuid,
        queryUuid,
        undefined,
        null,
        { toastErrors: false },
    );
    return (
        <ComposerNodeResultTable projectUuid={projectUuid} results={results} />
    );
};

type Props = {
    projectUuid: string;
    pipeline: ComposerChartPipeline;
    /** The tile's run; null while it loads or after it failed. */
    run: ComposerChartRunResults | null;
};

/** A composer tile's pipeline, read-only: each node's query, status, rows and error from the tile's run. */
export const ComposerTileLineage: FC<Props> = ({
    projectUuid,
    pipeline,
    run,
}) => {
    const nodeQueryUuids = useMemo(
        () =>
            run
                ? Object.fromEntries(
                      run.queries.map(({ nodeId, queryUuid }) => [
                          nodeId,
                          queryUuid,
                      ]),
                  )
                : null,
        [run],
    );
    const displayableNodeIds = useMemo(
        () => new Set(Object.keys(nodeQueryUuids ?? {})),
        [nodeQueryUuids],
    );
    const nodeStatuses = useComposerRunNodeStatuses({
        projectUuid,
        nodeQueryUuids,
    });
    return (
        <AiComposerLineage
            projectUuid={projectUuid}
            queries={pipeline.nodes}
            terminalNodeId={pipeline.terminalNodeId}
            displayableNodeIds={displayableNodeIds}
            nodeStatuses={nodeStatuses}
            renderNodeResult={(nodeId) => {
                const queryUuid = nodeQueryUuids?.[nodeId];
                return queryUuid ? (
                    <NodeRows projectUuid={projectUuid} queryUuid={queryUuid} />
                ) : null;
            }}
            threadActions={null}
            initialFocusNodeId={null}
        />
    );
};
