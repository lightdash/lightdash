import { interpolateUiString } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconPointer } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { NodeStatusIndicator } from '../../../ee/features/aiCopilot/components/ChatElements/ComposerNodeStatusIndicator';
// Spike: data app lineage reuses the AI composer pipeline view.
import { AiComposerLineage } from '../../../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerLineage';
import { type PipelineNotebookHandle } from '../../../ee/features/aiCopilot/components/ChatElements/composerPipeline/notebook/PipelineNotebook';
import {
    useComposerRunNodeStatuses,
    type ComposerRunNodeStatus,
} from '../../../ee/features/aiCopilot/components/ChatElements/useComposerRunNodeStatuses';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import classes from './AppLineageView.module.css';
import { DataAppNodeResult } from './DataAppNodeResult';
import { type DataAppPipeline } from './dataAppPipelines';
import { type UseAppLineageViewResult } from './useAppLineageView';

const NO_CHAT_NODES: ReadonlySet<string> = new Set();

const toNodeStatus = (
    status: DataAppPipeline['status'],
): ComposerRunNodeStatus['status'] => (status === 'ready' ? 'success' : status);

/** A single query's status is known from the bridge; no polling needed. */
const singleQueryStatuses = (
    pipeline: DataAppPipeline,
): Record<string, ComposerRunNodeStatus> => ({
    [pipeline.terminalNodeId]: {
        status: toNodeStatus(pipeline.status),
        error: pipeline.error,
        totalRowCount: pipeline.rowCount,
        durationMs: pipeline.durationMs,
    },
});

const PipelineDetail: FC<{
    projectUuid: string;
    pipeline: DataAppPipeline;
    lineage: UseAppLineageViewResult;
}> = ({ projectUuid, pipeline, lineage }) => {
    const getUiString = useUiStrings();
    const notebookRef = useRef<PipelineNotebookHandle>(null);
    const polledStatuses = useComposerRunNodeStatuses({
        projectUuid,
        nodeQueryUuids:
            pipeline.kind === 'composer' ? pipeline.nodeQueryUuids : null,
    });
    const nodeStatuses =
        pipeline.kind === 'composer'
            ? polledStatuses
            : singleQueryStatuses(pipeline);
    const displayableNodeIds = useMemo(
        () => new Set(Object.keys(pipeline.nodeQueryUuids)),
        [pipeline.nodeQueryUuids],
    );

    const { focusRequest, hover, showInApp } = lineage;
    useEffect(() => {
        if (!focusRequest || focusRequest.pipelineId !== pipeline.id) return;
        // Cells mount with the notebook; scroll once they're laid out.
        const frame = requestAnimationFrame(() =>
            notebookRef.current?.focusNode(focusRequest.nodeId),
        );
        return () => cancelAnimationFrame(frame);
    }, [focusRequest, pipeline.id]);

    const showInAppLabel = getUiString('dataApps.lineage.showInApp');
    return (
        <AiComposerLineage
            ref={notebookRef}
            projectUuid={projectUuid}
            queries={pipeline.queries}
            terminalNodeId={pipeline.terminalNodeId}
            nodeStatuses={nodeStatuses}
            displayableNodeIds={displayableNodeIds}
            renderNodeResult={(nodeId) => {
                const queryUuid = pipeline.nodeQueryUuids[nodeId];
                return queryUuid ? (
                    <DataAppNodeResult
                        projectUuid={projectUuid}
                        queryUuid={queryUuid}
                    />
                ) : null;
            }}
            chatNodeIds={NO_CHAT_NODES}
            onAddToChat={null}
            onNodeHover={(nodeId) => hover(nodeId ? pipeline : null, nodeId)}
            renderNodeActions={(node) =>
                pipeline.nodeQueryUuids[node.nodeId] ||
                node.nodeId === pipeline.terminalNodeId ? (
                    <Tooltip label={showInAppLabel}>
                        <ActionIcon
                            size="sm"
                            aria-label={showInAppLabel}
                            onClick={() => showInApp(pipeline, node.nodeId)}
                        >
                            <MantineIcon icon={IconPointer} />
                        </ActionIcon>
                    </Tooltip>
                ) : null
            }
        />
    );
};

const PipelineRailItem: FC<{
    pipeline: DataAppPipeline;
    selected: boolean;
    lineage: UseAppLineageViewResult;
}> = ({ pipeline, selected, lineage }) => {
    const getUiString = useUiStrings();
    const nodeCount = pipeline.queries.length;
    return (
        <UnstyledButton
            className={classes.railItem}
            mod={{ selected }}
            onClick={() => lineage.selectPipeline(pipeline.id)}
            onMouseEnter={() => lineage.hover(pipeline, null)}
            onMouseLeave={() => lineage.hover(null, null)}
        >
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <Box className={classes.railStatus}>
                    <NodeStatusIndicator
                        status={toNodeStatus(pipeline.status)}
                    />
                </Box>
                <Stack gap={2} miw={0} flex={1}>
                    <Text fz="sm" fw={500} truncate>
                        {pipeline.title}
                    </Text>
                    {pipeline.description && (
                        <Text fz="xs" c="dimmed" lineClamp={2}>
                            {pipeline.description}
                        </Text>
                    )}
                    <Text fz="xs" c="dimmed">
                        {interpolateUiString(
                            getUiString(
                                nodeCount === 1
                                    ? 'dataApps.lineage.steps.singular'
                                    : 'dataApps.lineage.steps.plural',
                            ),
                            { count: nodeCount },
                        )}
                        {pipeline.savedChartNodeIds.length > 0 &&
                            ` · ${getUiString('dataApps.lineage.savedChart')}`}
                    </Text>
                </Stack>
            </Group>
        </UnstyledButton>
    );
};

/**
 * Every query the app ran as a pipeline: a rail to pick one, its lineage
 * graph and notebook beside it. Linked to the app via hover highlights and
 * "Show in app".
 */
export const AppLineageView: FC<{
    projectUuid: string;
    lineage: UseAppLineageViewResult;
}> = ({ projectUuid, lineage }) => {
    const getUiString = useUiStrings();
    const { pipelines, selectedPipeline } = lineage;
    return (
        <Box className={classes.root}>
            <Stack gap={0} className={classes.rail}>
                <Text fz="xs" fw={600} c="dimmed" className={classes.railTitle}>
                    {getUiString('dataApps.lineage.pipelines')}
                </Text>
                <ScrollArea flex={1}>
                    <Stack gap={2} p="xs">
                        {pipelines.length === 0 && (
                            <Text fz="xs" c="dimmed" p="xs">
                                {getUiString('dataApps.lineage.empty')}
                            </Text>
                        )}
                        {[...pipelines].reverse().map((pipeline) => (
                            <PipelineRailItem
                                key={pipeline.id}
                                pipeline={pipeline}
                                selected={pipeline.id === selectedPipeline?.id}
                                lineage={lineage}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            </Stack>
            <Stack gap={0} className={classes.main}>
                {selectedPipeline ? (
                    <>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            className={classes.mainHeader}
                        >
                            <Stack gap={2} miw={0}>
                                <Text fz="sm" fw={600} truncate>
                                    {selectedPipeline.title}
                                </Text>
                                {selectedPipeline.description && (
                                    <Text fz="xs" c="dimmed" truncate>
                                        {selectedPipeline.description}
                                    </Text>
                                )}
                            </Stack>
                            <Button
                                size="compact-xs"
                                variant="default"
                                leftSection={
                                    <MantineIcon icon={IconPointer} size={14} />
                                }
                                onMouseEnter={() =>
                                    lineage.hover(selectedPipeline, null)
                                }
                                onMouseLeave={() => lineage.hover(null, null)}
                                onClick={() =>
                                    lineage.showInApp(selectedPipeline, null)
                                }
                            >
                                {getUiString('dataApps.lineage.showInApp')}
                            </Button>
                        </Group>
                        <Box className={classes.graph}>
                            <PipelineDetail
                                key={selectedPipeline.id}
                                projectUuid={projectUuid}
                                pipeline={selectedPipeline}
                                lineage={lineage}
                            />
                        </Box>
                    </>
                ) : (
                    <Text fz="sm" c="dimmed" p="md">
                        {getUiString('dataApps.lineage.selectPipeline')}
                    </Text>
                )}
            </Stack>
        </Box>
    );
};
