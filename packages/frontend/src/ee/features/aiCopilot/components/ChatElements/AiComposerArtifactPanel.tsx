import {
    getComposerVizPlan,
    type AiComposerChartArtifactConfig,
    type ComposerVizKind,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import styles from './AiArtifactPanel.module.css';
import { AiComposerArtifactVisualization } from './AiComposerArtifactVisualization';
import { pickVizKind } from './AiVizSwitchedResult.utils';
import { AiComposerPipelinePanel } from './composerPipeline/AiComposerPipelinePanel';
import { useArtifactResultRows } from './useArtifactResultRows';

type Props = {
    projectUuid: string;
    title: string;
    description: string | null;
    config: AiComposerChartArtifactConfig;
    onClose: (() => void) | null;
};

const EMPTY_NODE_RESULTS = new Set<string>();

// Composer artifact: the displayed node result and its viz switcher on top,
// the pipeline panel underneath. Keyed per version so a new run resets it.
export const AiComposerArtifactPanel: FC<Props> = ({
    projectUuid,
    title,
    description,
    config,
    onClose,
}) => {
    const [displayedNodeId, setDisplayedNodeId] = useState(
        config.terminalNodeId,
    );
    const isTerminalDisplayed = displayedNodeId === config.terminalNodeId;
    const displayableNodeIds = useMemo(
        () =>
            config.nodeResults
                ? new Set(Object.keys(config.nodeResults))
                : EMPTY_NODE_RESULTS,
        [config.nodeResults],
    );
    const displayedNode = useMemo(
        () =>
            config.queries.find((query) => query.nodeId === displayedNodeId) ??
            null,
        [config.queries, displayedNodeId],
    );
    // The terminal node's stored snapshot predates per-node results.
    const queryUuid = isTerminalDisplayed
        ? config.lastQueryUuid
        : config.nodeResults?.[displayedNodeId]?.queryUuid;

    const results = useInfiniteQueryResults(projectUuid, queryUuid);
    const { columns, rows } = useArtifactResultRows(results);
    const storedVizConfig = isTerminalDisplayed
        ? (config.vizConfig ?? null)
        : null;
    const plan = useMemo(
        () =>
            getComposerVizPlan({
                columns,
                rows,
                node: displayedNode,
                vizConfig: storedVizConfig,
            }),
        [columns, rows, displayedNode, storedVizConfig],
    );
    // Chosen kind per node, remembered while this version is open.
    const [chosenKinds, setChosenKinds] = useState<
        Record<string, ComposerVizKind>
    >({});
    const kind = pickVizKind(plan, chosenKinds[displayedNodeId]);
    const chooseKind = (next: ComposerVizKind) =>
        setChosenKinds((current) => ({ ...current, [displayedNodeId]: next }));

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
            {onClose && (
                <Group gap={2} className={styles.headRight}>
                    <ActionIcon size="sm" onClick={onClose} aria-label="Close">
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>
            )}
        </Box>
    );

    return (
        <Box className={styles.floatingPanel}>
            <Box className={clsx(styles.floatingContent, styles.flushContent)}>
                <AiComposerPipelinePanel
                    projectUuid={projectUuid}
                    queries={config.queries}
                    terminalNodeId={config.terminalNodeId}
                    displayedNodeId={displayedNodeId}
                    displayableNodeIds={displayableNodeIds}
                    onDisplayNode={setDisplayedNodeId}
                >
                    <AiComposerArtifactVisualization
                        projectUuid={projectUuid}
                        results={results}
                        plan={plan}
                        kind={kind}
                        onKindChange={chooseKind}
                        headerContent={head}
                        flush
                    />
                </AiComposerPipelinePanel>
            </Box>
        </Box>
    );
};
