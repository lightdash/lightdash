import {
    FeatureFlags,
    ChartKind,
    getComposerVizPanelOptions,
    getComposerVizPanelValue,
    switchComposerVizKind,
    type AiComposerChartArtifactConfig,
    type AllVizChartConfig,
    type ApiAiAgentComposerArtifactVizQuery,
    type ApiError,
    type ComposerVizKind,
    type ComposerVizPanelOptions,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconArrowLeft, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { getAiAgentArtifactResultsUrl } from '../../hooks/aiAgentRouting';
import { useUpdateComposerVizConfig } from '../../hooks/useAiAgentArtifacts';
import styles from './AiArtifactPanel.module.css';
import { AiComposerArtifactVisualization } from './AiComposerArtifactVisualization';
import { AiComposerRunQueryVisualization } from './AiComposerRunQueryVisualization';
import { AiComposerPipelinePanel } from './composerPipeline/AiComposerPipelinePanel';
import {
    AiComposerVizConfigPanel,
    type AiComposerVizConfigPanelMode,
} from './composerVizConfig/AiComposerVizConfigPanel';
import { useArtifactResultRows } from './useArtifactResultRows';
import { useComposerRunNodeStatuses } from './useComposerRunNodeStatuses';

const SAVE_DELAY_MS = 400;
const READ_ONLY_REASON =
    'Only the thread owner or an agent admin can change this chart';

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
    onClose: (() => void) | null;
};

// Composer artifact: the displayed node result, the viz config panel under it,
// the pipeline panel at the bottom. Keyed per version so a new version resets it.
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
    onClose,
}) => {
    const isEmbed = useIsEmbedded();
    const identityFlag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const identityEnabled = identityFlag.data?.enabled === true;
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
    const queryUuid = nodeQueryUuids?.[displayedNodeId];

    const results = useInfiniteQueryResults(
        projectUuid,
        isEmbed || !identityFlag.isLoading ? queryUuid : undefined,
        undefined,
        identityEnabled && !isEmbed && queryUuid
            ? getAiAgentArtifactResultsUrl({
                  projectUuid,
                  agentUuid,
                  artifactUuid,
                  versionUuid,
                  queryUuid,
                  cached: false,
              })
            : null,
    );
    const { columns, rows, isLoading } = useArtifactResultRows(results);
    const storedVizConfig =
        isTerminalDisplayed && config.schemaVersion === 1
            ? (config.vizConfig ?? null)
            : null;
    // v2 draws the presented node through the runQuery chart builders; nothing to edit.
    const runQueryVizConfig =
        config.schemaVersion === 2 && isTerminalDisplayed
            ? config.vizConfig
            : null;
    const metadata = useMemo(
        () => ({ title, description: description ?? '' }),
        [title, description],
    );
    const derivedValue = useMemo(
        () => getComposerVizPanelValue({ columns, vizConfig: storedVizConfig }),
        [columns, storedVizConfig],
    );

    // Edits on screen: the terminal node's are written back, other nodes' are ephemeral.
    const [editedValues, setEditedValues] = useState<
        Record<string, AllVizChartConfig>
    >({});
    // The last chart viz config per node, restored when leaving the table.
    const [rememberedCharts, setRememberedCharts] = useState<
        Record<string, AllVizChartConfig>
    >({});
    const isResultReady = !isLoading && !results.error && !runError;
    const value = isResultReady
        ? (editedValues[displayedNodeId] ?? derivedValue)
        : (editedValues[displayedNodeId] ?? storedVizConfig ?? derivedValue);
    const options = useMemo(
        (): ComposerVizPanelOptions =>
            getComposerVizPanelOptions(value, columns, rows),
        [value, columns, rows],
    );

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

    const hasVizConfigPanel = config.schemaVersion === 1;
    const panelMode = ((): AiComposerVizConfigPanelMode => {
        if (!isResultReady || options.kinds.length <= 1) return 'static';
        return isTerminalDisplayed ? 'expandable' : 'switcher';
    })();
    const fieldsDisabledReason = isWritable ? null : READ_ONLY_REASON;
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

    const visualization =
        runQueryVizConfig && queryUuid && !runError && !results.error ? (
            <AiComposerRunQueryVisualization
                projectUuid={projectUuid}
                nodeQueryUuid={queryUuid}
                columns={columns}
                vizConfig={runQueryVizConfig}
                metadata={metadata}
                headerContent={head}
            />
        ) : (
            <AiComposerArtifactVisualization
                projectUuid={projectUuid}
                results={results}
                queryUuid={queryUuid ?? null}
                runError={runError}
                onRerun={onRerun}
                vizConfig={value}
                headerContent={head}
                flush
            />
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
                    nodeStatuses={nodeStatuses}
                    expanded={isPipelineOpen}
                    onExpandedChange={(open) => {
                        setIsPipelineOpen(open);
                        if (open) setIsChartOpen(false);
                    }}
                >
                    {hasVizConfigPanel ? (
                        <AiComposerVizConfigPanel
                            value={value}
                            columns={columns}
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
                            {visualization}
                        </AiComposerVizConfigPanel>
                    ) : (
                        visualization
                    )}
                </AiComposerPipelinePanel>
            </Box>
        </Box>
    );
};
