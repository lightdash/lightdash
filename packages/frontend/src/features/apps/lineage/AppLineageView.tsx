import {
    ActionIcon,
    Box,
    Button,
    Group,
    Loader,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconAlertCircle, IconPointer, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
// Spike: data app lineage reuses the AI composer pipeline view.
import { AiComposerLineage } from '../../../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerLineage';
import { nodeTypeIcon } from '../../../ee/features/aiCopilot/components/ChatElements/composerPipeline/nodeTypeIcon';
import { type PipelineNotebookHandle } from '../../../ee/features/aiCopilot/components/ChatElements/composerPipeline/notebook/PipelineNotebook';
import {
    useComposerRunNodeStatuses,
    type ComposerRunNodeStatus,
} from '../../../ee/features/aiCopilot/components/ChatElements/useComposerRunNodeStatuses';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { type QueryRef } from '../utils/queryRefs';
import classes from './AppLineageView.module.css';
import { DataAppNodeResult } from './DataAppNodeResult';
import { type DataAppPipeline } from './dataAppPipelines';
import { type UseAppLineageViewResult } from './useAppLineageView';

/** Query references attached to the builder's chat input; null when no chat. */
export type LineageChat = {
    refs: QueryRef[];
    add: (ref: QueryRef) => void;
};

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
    chat: LineageChat | null;
}> = ({ projectUuid, pipeline, lineage, chat }) => {
    const getUiString = useUiStrings();
    const chatNodeIds = useMemo(
        () =>
            chat
                ? new Set(
                      chat.refs
                          .filter((ref) => ref.pipelineId === pipeline.id)
                          .map((ref) => ref.pipelineNodeId),
                  )
                : NO_CHAT_NODES,
        [chat, pipeline.id],
    );
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
            chatNodeIds={chatNodeIds}
            onAddToChat={
                chat
                    ? (node) =>
                          chat.add({
                              title: node.title,
                              queryId: pipeline.queryId,
                              nodeId:
                                  pipeline.kind === 'composer'
                                      ? node.nodeId
                                      : null,
                              pipelineId: pipeline.id,
                              pipelineNodeId: node.nodeId,
                          })
                    : null
            }
            onNodeHover={(nodeId) => hover(nodeId ? pipeline : null, nodeId)}
            renderNodeActions={(node) =>
                node.isTerminal ? (
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

const terminalQueryOf = (pipeline: DataAppPipeline) =>
    pipeline.queries.find((q) => q.nodeId === pipeline.terminalNodeId) ?? null;

/** Type icon of the step that produced the result; status only when not ready. */
const RailItemIcon: FC<{ pipeline: DataAppPipeline }> = ({ pipeline }) => {
    const terminal = terminalQueryOf(pipeline);
    switch (pipeline.status) {
        case 'running':
            return <Loader size={12} color="gray" />;
        case 'error':
            return (
                <MantineIcon icon={IconAlertCircle} size={14} color="red.6" />
            );
        default:
            return terminal ? (
                <MantineIcon
                    icon={nodeTypeIcon(terminal)}
                    size={14}
                    stroke={1.5}
                    color="ldGray.6"
                />
            ) : null;
    }
};

const PipelineRailItem: FC<{
    pipeline: DataAppPipeline;
    selected: boolean;
    lineage: UseAppLineageViewResult;
}> = ({ pipeline, selected, lineage }) => {
    const stepCount = pipeline.queries.length;
    return (
        <UnstyledButton
            className={classes.railItem}
            mod={{ selected }}
            title={pipeline.description ?? undefined}
            onClick={() => lineage.selectPipeline(pipeline.id)}
            onMouseEnter={() => lineage.hover(pipeline, null)}
            onMouseLeave={() => lineage.hover(null, null)}
        >
            <Box className={classes.railIcon}>
                <RailItemIcon pipeline={pipeline} />
            </Box>
            <Text fz="sm" truncate flex={1}>
                {pipeline.title}
            </Text>
            {stepCount > 1 && (
                <Text fz="xs" c="dimmed" className={classes.railMeta}>
                    {stepCount}
                </Text>
            )}
        </UnstyledButton>
    );
};

const matchesSearch = (pipeline: DataAppPipeline, needle: string) =>
    needle === '' ||
    pipeline.title.toLowerCase().includes(needle) ||
    (pipeline.description?.toLowerCase().includes(needle) ?? false);

/**
 * Every query the app ran as a pipeline: a rail to pick one, its lineage
 * graph and notebook beside it. Linked to the app via hover highlights and
 * "Show in app".
 */
export const AppLineageView: FC<{
    projectUuid: string;
    lineage: UseAppLineageViewResult;
    chat: LineageChat | null;
}> = ({ projectUuid, lineage, chat }) => {
    const getUiString = useUiStrings();
    const { pipelines, selectedPipeline } = lineage;
    const [search, setSearch] = useState('');
    const needle = search.trim().toLowerCase();
    const visible = useMemo(
        () =>
            [...pipelines]
                .reverse()
                .filter((pipeline) => matchesSearch(pipeline, needle)),
        [pipelines, needle],
    );
    return (
        <Box className={classes.root}>
            <Stack gap={0} className={classes.rail}>
                <TextInput
                    size="xs"
                    variant="unstyled"
                    className={classes.railSearch}
                    placeholder={getUiString('dataApps.lineage.search')}
                    aria-label={getUiString('dataApps.lineage.search')}
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                />
                <ScrollArea flex={1}>
                    <Stack gap={0} p={4}>
                        {visible.length === 0 && (
                            <Text fz="xs" c="dimmed" p="xs">
                                {getUiString(
                                    pipelines.length === 0
                                        ? 'dataApps.lineage.empty'
                                        : 'dataApps.lineage.noMatches',
                                )}
                            </Text>
                        )}
                        {visible.map((pipeline) => (
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
                                chat={chat}
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
