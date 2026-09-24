import {
    getComposerVizPlan,
    type AiComposerChartArtifactConfig,
    type ComposerVizKind,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import styles from './AiArtifactPanel.module.css';
import { AiComposerArtifactVisualization } from './AiComposerArtifactVisualization';
import { AiComposerPipelinePanel } from './composerPipeline/AiComposerPipelinePanel';
import { useArtifactResultRows } from './useArtifactResultRows';

type Props = {
    projectUuid: string;
    title: string;
    description: string | null;
    config: AiComposerChartArtifactConfig;
    /** The terminal node's result, read directly by its stored queryUuid. */
    results: InfiniteQueryResults;
    onClose: (() => void) | null;
};

/**
 * Composer artifact: the displayed node result on top with its viz switcher,
 * the pipeline panel underneath. Viz choices are ephemeral.
 */
export const AiComposerArtifactPanel: FC<Props> = ({
    projectUuid,
    title,
    description,
    config,
    results,
    onClose,
}) => {
    const { columns, rows } = useArtifactResultRows(results);
    const terminalNode = useMemo(
        () =>
            config.queries.find(
                (query) => query.nodeId === config.terminalNodeId,
            ) ?? null,
        [config.queries, config.terminalNodeId],
    );
    const plan = useMemo(
        () => getComposerVizPlan({ columns, rows, node: terminalNode }),
        [columns, rows, terminalNode],
    );
    const [selectedKind, setSelectedKind] = useState<ComposerVizKind | null>(
        null,
    );
    const kind =
        selectedKind && plan.availableKinds.includes(selectedKind)
            ? selectedKind
            : plan.defaultKind;
    const showPill = !results.error && plan.availableKinds.length > 1;

    const head = (
        <Box className={clsx(styles.head, styles.flushHead)}>
            <Stack gap={0} flex={1} miw={0}>
                <TruncatedText fz="sm" fw={600} maxWidth="100%">
                    {title}
                </TruncatedText>
                {description && (
                    <TruncatedText fz="xs" c="dimmed" maxWidth="100%">
                        {description}
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
                    queries={config.queries}
                    terminalNodeId={config.terminalNodeId}
                >
                    <Box className={styles.displayedResult}>
                        <Box
                            className={clsx(
                                styles.displayedResultBody,
                                showPill && styles.withPillClearance,
                            )}
                        >
                            <AiComposerArtifactVisualization
                                projectUuid={projectUuid}
                                results={results}
                                kind={kind}
                                plan={plan}
                                headerContent={head}
                                flush
                            />
                        </Box>
                        {showPill && (
                            <Box className={styles.floatingPill}>
                                <AgentVisualizationChartTypeSwitcher
                                    availableChartTypes={plan.availableKinds}
                                    selectedChartType={kind}
                                    onChartTypeChange={setSelectedKind}
                                    variant="pill"
                                />
                            </Box>
                        )}
                    </Box>
                </AiComposerPipelinePanel>
            </Box>
        </Box>
    );
};
