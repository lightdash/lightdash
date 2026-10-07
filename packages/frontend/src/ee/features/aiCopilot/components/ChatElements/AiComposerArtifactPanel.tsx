import {
    ChartKind,
    DimensionType,
    getComposerVizPanelOptions,
    VizIndexType,
    getComposerVizPanelValue,
    switchComposerVizKind,
    type AiComposerChartArtifactConfig,
    type AllVizChartConfig,
    type ComposerVizKind,
    type ComposerVizPanelOptions,
    type ResultColumn,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconArrowLeft, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useUpdateComposerVizConfig } from '../../hooks/useAiAgentArtifacts';
import styles from './AiArtifactPanel.module.css';
import { AiComposerArtifactVisualization } from './AiComposerArtifactVisualization';
import { AiComposerPipelinePanel } from './composerPipeline/AiComposerPipelinePanel';
import {
    AiComposerVizConfigPanel,
    type AiComposerVizConfigPanelMode,
} from './composerVizConfig/AiComposerVizConfigPanel';
import { useArtifactResultRows } from './useArtifactResultRows';

const SAVE_DELAY_MS = 400;
const READ_ONLY_REASON =
    'Only the thread owner or an agent admin can change this chart';
const EXPIRED_REASON = 'These results have expired, so the chart is read-only';

/** Columns an expired result's stored viz config names, so its controls can still show it. */
const columnsOfVizConfig = (vizConfig: AllVizChartConfig): ResultColumn[] => {
    if (vizConfig.type === ChartKind.TABLE || !vizConfig.fieldConfig) return [];
    const { x, y, groupBy } = vizConfig.fieldConfig;
    return [
        ...(x
            ? [
                  {
                      reference: x.reference,
                      type:
                          x.type === VizIndexType.TIME
                              ? DimensionType.DATE
                              : DimensionType.STRING,
                  },
              ]
            : []),
        ...y.map((item) => ({
            reference: item.reference,
            type: DimensionType.NUMBER,
        })),
        ...(groupBy ?? []).map((item) => ({
            reference: item.reference,
            type: DimensionType.STRING,
        })),
    ];
};

type Props = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    title: string;
    description: string | null;
    config: AiComposerChartArtifactConfig;
    /** Whether edits on the terminal node are written to the artifact version. */
    canEdit: boolean;
    onClose: (() => void) | null;
};

const EMPTY_NODE_RESULTS = new Set<string>();

// Composer artifact: the displayed node result, the viz config panel under it,
// the pipeline panel at the bottom. Keyed per version so a new run resets it.
export const AiComposerArtifactPanel: FC<Props> = ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    title,
    description,
    config,
    canEdit,
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
    const { columns, rows, isLoading } = useArtifactResultRows(results);
    const storedVizConfig = isTerminalDisplayed
        ? (config.vizConfig ?? null)
        : null;
    const derivedValue = useMemo(
        () =>
            getComposerVizPanelValue({
                columns,
                rows,
                node: displayedNode,
                vizConfig: storedVizConfig,
            }),
        [columns, rows, displayedNode, storedVizConfig],
    );

    // Edits on screen: the terminal node's are written back, other nodes' are ephemeral.
    const [editedValues, setEditedValues] = useState<
        Record<string, AllVizChartConfig>
    >({});
    // The last chart viz config per node, restored when leaving the table.
    const [rememberedCharts, setRememberedCharts] = useState<
        Record<string, AllVizChartConfig>
    >({});
    const isResultReady = !isLoading && !results.error;
    const value = isResultReady
        ? (editedValues[displayedNodeId] ?? derivedValue)
        : (editedValues[displayedNodeId] ?? storedVizConfig ?? derivedValue);
    const isExpired = !!results.error;
    const panelColumns = useMemo(
        () => (isExpired ? columnsOfVizConfig(value) : columns),
        [isExpired, value, columns],
    );
    const options = useMemo((): ComposerVizPanelOptions => {
        const available = getComposerVizPanelOptions(value, panelColumns, rows);
        return isExpired ? { ...available, kinds: [] } : available;
    }, [value, panelColumns, rows, isExpired]);

    const { mutate: saveVizConfig } = useUpdateComposerVizConfig({
        projectUuid,
        agentUuid,
        artifactUuid,
        versionUuid,
    });
    const saveSoon = useDebouncedCallback(saveVizConfig, {
        delay: SAVE_DELAY_MS,
        flushOnUnmount: true,
    });
    const isWritable = isTerminalDisplayed && canEdit;
    const setValue = (next: AllVizChartConfig) => {
        setEditedValues((current) => ({
            ...current,
            [displayedNodeId]: next,
        }));
        if (isWritable) saveSoon(next);
    };
    const changeKind = (kind: ComposerVizKind) => {
        const remembered = rememberedCharts[displayedNodeId] ?? null;
        if (value.type !== ChartKind.TABLE) {
            setRememberedCharts((current) => ({
                ...current,
                [displayedNodeId]: value,
            }));
        }
        setValue(
            switchComposerVizKind(value, kind, {
                columns,
                rows,
                node: displayedNode,
                remembered,
            }),
        );
    };

    const panelMode = ((): AiComposerVizConfigPanelMode => {
        // An expired terminal result still opens onto its stored viz config, read-only.
        if (isExpired)
            return isTerminalDisplayed && storedVizConfig
                ? 'expandable'
                : 'static';
        if (!isResultReady || options.kinds.length <= 1) return 'static';
        return isTerminalDisplayed ? 'expandable' : 'switcher';
    })();
    const fieldsDisabledReason = ((): string | null => {
        if (isExpired) return EXPIRED_REASON;
        return isWritable ? null : READ_ONLY_REASON;
    })();
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
                    expanded={isPipelineOpen}
                    onExpandedChange={(open) => {
                        setIsPipelineOpen(open);
                        if (open) setIsChartOpen(false);
                    }}
                >
                    <AiComposerVizConfigPanel
                        value={value}
                        columns={panelColumns}
                        options={options}
                        onChange={setValue}
                        onKindChange={changeKind}
                        mode={panelMode}
                        expanded={isChartOpen}
                        onExpandedChange={(open) => {
                            setIsChartOpen(open);
                            if (open) setIsPipelineOpen(false);
                        }}
                        fieldsDisabledReason={fieldsDisabledReason}
                    >
                        <AiComposerArtifactVisualization
                            projectUuid={projectUuid}
                            results={results}
                            queryUuid={queryUuid ?? null}
                            vizConfig={value}
                            headerContent={head}
                            flush
                        />
                    </AiComposerVizConfigPanel>
                </AiComposerPipelinePanel>
            </Box>
        </Box>
    );
};
