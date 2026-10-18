import {
    COMPOSER_TABLE_VIZ,
    type AiComposerChartArtifactConfig,
    type ApiAiAgentComposerArtifactVizQuery,
    type ApiError,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconArrowLeft, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { getAiAccessRefusal } from '../../../../../features/aiAccess/errors';
import { useUpdateComposerViz } from '../../hooks/useAiAgentArtifacts';
import { AiAccessCallout } from './AiAccessCallout';
import styles from './AiArtifactPanel.module.css';
import { AiComposerResultError } from './AiComposerResultError';
import {
    AiComposerVisualization,
    type ComposerVizState,
} from './AiComposerVisualization';
import { AiComposerPipelinePanel } from './composerPipeline/AiComposerPipelinePanel';
import { AiComposerVizConfigPanel } from './composerVizConfig/AiComposerVizConfigPanel';
import { useArtifactNodeResults } from './useArtifactNodeResults';
import { useComposerRunNodeStatuses } from './useComposerRunNodeStatuses';

const SAVE_DELAY_MS = 400;

type Props = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    title: string;
    description: string | null;
    config: AiComposerChartArtifactConfig;
    /** The run started on open; null while it starts or when it failed. */
    run: ApiAiAgentComposerArtifactVizQuery | null;
    runError: ApiError | null;
    onRerun: () => void;
    /** Whether edits on the terminal node are written to the artifact version. */
    canEdit: boolean;
    /** Actions shown in the head beside Close (a SQL artifact's save and download). */
    headerActions?: ReactNode;
    /** Hides the pipeline panel: a one-node pipeline has nothing to list. */
    showPipeline?: boolean;
    onClose: (() => void) | null;
};

// Composer artifact: the displayed node result drawn by the classic chart
// stack, the Chart bar under it, the pipeline panel at the bottom. Keyed per
// version so a new version resets it.
export const AiComposerArtifactPanel: FC<Props> = ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    title,
    description,
    config,
    run,
    runError,
    onRerun,
    canEdit,
    headerActions,
    showPipeline = true,
    onClose,
}) => {
    const artifact = useMemo(
        () => ({ projectUuid, agentUuid, artifactUuid, versionUuid }),
        [projectUuid, agentUuid, artifactUuid, versionUuid],
    );
    const [displayedNodeId, setDisplayedNodeId] = useState(
        config.terminalNodeId,
    );
    const isTerminalDisplayed = displayedNodeId === config.terminalNodeId;
    const nodeQueryUuids = run?.nodeQueryUuids ?? null;
    const displayableNodeIds = useMemo(
        () => new Set(Object.keys(nodeQueryUuids ?? {})),
        [nodeQueryUuids],
    );
    const nodeStatuses = useComposerRunNodeStatuses({
        projectUuid,
        nodeQueryUuids,
    });
    const displayedNode = useMemo(
        () =>
            config.queries.find((query) => query.nodeId === displayedNodeId) ??
            null,
        [config.queries, displayedNodeId],
    );
    const queryUuid = nodeQueryUuids?.[displayedNodeId] ?? null;
    const results = useArtifactNodeResults(artifact, queryUuid);

    // The terminal node opens on the stored viz, other nodes on a table.
    // Edits on screen: the terminal node's are written back, other nodes' are ephemeral.
    const [states, setStates] = useState<Record<string, ComposerVizState>>({});
    const state: ComposerVizState = states[displayedNodeId] ?? {
        viz: isTerminalDisplayed ? config.viz : COMPOSER_TABLE_VIZ,
        overrideChartType: null,
    };

    const { mutate: saveViz } = useUpdateComposerViz(artifact);
    const saveSoon = useDebouncedCallback(saveViz, {
        delay: SAVE_DELAY_MS,
        flushOnUnmount: true,
    });
    const isWritable = isTerminalDisplayed && canEdit;
    const setState = (next: ComposerVizState) => {
        setStates((current) => ({ ...current, [displayedNodeId]: next }));
        // A switcher pick becomes the stored intent, so the thread reopens on it.
        if (isWritable) {
            saveSoon(
                next.overrideChartType
                    ? {
                          ...next.viz,
                          intent: {
                              ...(next.viz.intent ??
                                  COMPOSER_TABLE_VIZ.intent!),
                              defaultVizType: next.overrideChartType,
                          },
                          chartConfig: null,
                      }
                    : next.viz,
            );
        }
    };

    // Only one of Chart and Queries is open at a time.
    const [isChartOpen, setIsChartOpen] = useState(false);
    const [isPipelineOpen, setIsPipelineOpen] = useState(false);

    const displayedTitle = isTerminalDisplayed
        ? title
        : (displayedNode?.title ?? displayedNodeId);
    const displayedDescription = isTerminalDisplayed
        ? description
        : (displayedNode?.description ?? null);

    const head = (
        <Box className={clsx(styles.head, styles.flushHead)}>
            {!isTerminalDisplayed && (
                <Tooltip label="Back to result" position="bottom">
                    <ActionIcon
                        size="sm"
                        onClick={() =>
                            setDisplayedNodeId(config.terminalNodeId)
                        }
                        aria-label="Back to result"
                    >
                        <MantineIcon icon={IconArrowLeft} />
                    </ActionIcon>
                </Tooltip>
            )}
            <Stack gap={0} flex={1} miw={0}>
                <TruncatedText fz="sm" fw={600} maxWidth="100%">
                    {displayedTitle}
                </TruncatedText>
                {displayedDescription && (
                    <TruncatedText fz="xs" c="dimmed" maxWidth="100%">
                        {displayedDescription}
                    </TruncatedText>
                )}
            </Stack>
            {(headerActions || onClose) && (
                <Group gap={2} className={styles.headRight}>
                    {isTerminalDisplayed ? headerActions : null}
                    {onClose && (
                        <ActionIcon
                            size="sm"
                            onClick={onClose}
                            aria-label="Close"
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    )}
                </Group>
            )}
        </Box>
    );

    const error = runError ?? results.error;
    const refusal = getAiAccessRefusal(error?.error);
    const result = (() => {
        if (refusal) {
            return (
                <AiAccessCallout
                    projectUuid={projectUuid}
                    refusal={refusal}
                    onRerun={onRerun}
                    variant="inline"
                />
            );
        }
        if (error) {
            return (
                <AiComposerResultError
                    headerContent={head}
                    message={error.error?.message ?? null}
                />
            );
        }
        return (
            <AiComposerVisualization
                artifact={artifact}
                nodeId={displayedNodeId}
                node={displayedNode}
                results={results}
                queryUuid={queryUuid}
                metadata={{
                    title: displayedTitle,
                    description: displayedDescription,
                }}
                state={state}
                onStateChange={setState}
                canEdit={isWritable}
                configOpen={isChartOpen}
                headerContent={head}
                renderConfig={(chartType) => (
                    <AiComposerVizConfigPanel
                        chartType={chartType}
                        expanded={isChartOpen}
                        onExpandedChange={(open) => {
                            setIsChartOpen(open);
                            if (open) setIsPipelineOpen(false);
                        }}
                        editable={isWritable}
                    />
                )}
            />
        );
    })();

    return (
        <Box className={styles.floatingPanel}>
            <Box className={clsx(styles.floatingContent, styles.flushContent)}>
                {showPipeline ? (
                    <AiComposerPipelinePanel
                        projectUuid={projectUuid}
                        queries={config.queries}
                        terminalNodeId={config.terminalNodeId}
                        displayedNodeId={displayedNodeId}
                        displayableNodeIds={displayableNodeIds}
                        onDisplayNode={setDisplayedNodeId}
                        nodeStatuses={nodeStatuses}
                        expanded={isPipelineOpen}
                        onExpandedChange={(open) => {
                            setIsPipelineOpen(open);
                            if (open) setIsChartOpen(false);
                        }}
                    >
                        {result}
                    </AiComposerPipelinePanel>
                ) : (
                    result
                )}
            </Box>
        </Box>
    );
};
