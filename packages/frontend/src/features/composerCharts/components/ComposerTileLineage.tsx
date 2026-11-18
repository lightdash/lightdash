import {
    type ComposerChartPipeline,
    type ComposerChartRunResults,
} from '@lightdash/common';
import { Box, Stack } from '@mantine/core';
import { useMemo, type FC, type ReactNode } from 'react';
import Callout from '../../../components/common/Callout';
import { ComposerNodeResultTable } from '../../../ee/features/aiCopilot/components/ChatElements/AiComposerNodeResult';
import { AiComposerLineage } from '../../../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerLineage';
import { useComposerRunNodeStatuses } from '../../../ee/features/aiCopilot/components/ChatElements/useComposerRunNodeStatuses';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';
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
    /** Why the run failed before any node ran; its nodes then carry no status. */
    runError: string | null;
    /** The tile's chart, drawn beside the graph; null while it cannot draw. */
    chart: ReactNode | null;
};

/** A composer tile's pipeline, read-only: each node's query, status, rows and error from the tile's run. */
export const ComposerTileLineage: FC<Props> = ({
    projectUuid,
    pipeline,
    run,
    runError,
    chart,
}) => {
    const runFailed = useUiString('tile.composerChart.lineageRunFailed');
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
    const lineage = (
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
            graphAside={chart}
            threadActions={null}
            initialFocusNodeId={null}
        />
    );
    if (runError === null) return lineage;
    return (
        <Stack gap={0} h="100%">
            <Callout variant="danger" title={runFailed} m="md">
                {runError}
            </Callout>
            <Box flex={1} mih={0}>
                {lineage}
            </Box>
        </Stack>
    );
};
