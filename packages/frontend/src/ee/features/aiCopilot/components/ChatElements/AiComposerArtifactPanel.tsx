import { subject } from '@casl/ability';
import {
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
import {
    ActionIcon,
    Box,
    Group,
    Menu,
    SegmentedControl,
    Stack,
} from '@mantine/core';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { IconDots, IconTableExport, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC, type RefObject } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import ExportDataModal from '../../../../../components/DashboardTiles/ExportDataModal';
import { type EChartsReact } from '../../../../../components/EChartsReactWrapper';
import { useAbilityContext } from '../../../../../providers/Ability/useAbilityContext';
import useApp from '../../../../../providers/App/useApp';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import styles from './AiArtifactPanel.module.css';
import {
    AiChartImageExportMenuItem,
    AiChartImageExportModal,
} from './AiChartImageExport';
import { AiComposerArtifactVisualization } from './AiComposerArtifactVisualization';
import { AiComposerNodeResult } from './AiComposerNodeResult';
import { AiComposerRunQueryVisualization } from './AiComposerRunQueryVisualization';
import { AiComposerLineage } from './composerPipeline/AiComposerLineage';
import {
    AiComposerVizConfigPanel,
    type AiComposerVizConfigPanelMode,
} from './composerVizConfig/AiComposerVizConfigPanel';
import { useArtifactResultRows } from './useArtifactResultRows';
import {
    useComposerNodeResults,
    type ComposerPanelSource,
} from './useComposerNodeResults';
import { useComposerRunNodeStatuses } from './useComposerRunNodeStatuses';

const SAVE_DELAY_MS = 400;
const READ_ONLY_REASON =
    'Only the thread owner or an agent admin can change this chart';

type Props = {
    projectUuid: string;
    agentUuid: string;
    source: ComposerPanelSource;
    title: string;
    description: string | null;
    config: AiComposerChartArtifactConfig;
    /** The run started on open; null while it starts or when it failed. */
    run: ApiAiAgentComposerArtifactVizQuery | null;
    runError: ApiError | null;
    onRerun: () => void;
    /** Writes terminal node edits back; null when they stay on screen only. */
    onSaveVizConfig: ((vizConfig: AllVizChartConfig) => void) | null;
    onClose: (() => void) | null;
    /** Nodes attached to the chat input. */
    chatNodeIds: ReadonlySet<string>;
    /** Null when this pipeline can't be pinned to the chat. */
    onAddToChat: ((node: { nodeId: string; title: string }) => void) | null;
};

type ArtifactView = 'chart' | 'lineage';

// Composer artifact: the result as a chart, or its lineage (graph and steps).
// Keyed per version so a new version resets it.
export const AiComposerArtifactPanel: FC<Props> = ({
    projectUuid,
    agentUuid,
    source,
    title,
    description,
    config,
    run,
    runError,
    onRerun,
    onSaveVizConfig,
    onClose,
    chatNodeIds,
    onAddToChat,
}) => {
    const getUiString = useUiStrings();
    const { user } = useApp();
    const ability = useAbilityContext();
    const isEmbed = useIsEmbedded();
    const [view, setView] = useState<ArtifactView>('chart');
    const [imageExportRef, setImageExportRef] =
        useState<RefObject<EChartsReact | null>>();
    const [
        exportImageModalOpened,
        { open: openExportImageModal, close: closeExportImageModal },
    ] = useDisclosure(false);
    const [
        downloadModalOpened,
        { open: openDownloadModal, close: closeDownloadModal },
    ] = useDisclosure(false);
    const canExportData = user.data?.ability?.can(
        'manage',
        subject('ExportCsv', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
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
            config.queries.find(
                (query) => query.nodeId === config.terminalNodeId,
            ) ?? null,
        [config.queries, config.terminalNodeId],
    );
    const queryUuid = nodeQueryUuids?.[config.terminalNodeId];

    const results = useComposerNodeResults({
        projectUuid,
        agentUuid,
        source,
        queryUuid,
    });
    const { columns, rows, isLoading } = useArtifactResultRows(results);
    const columnOrder = useMemo(
        () => columns.map((column) => column.reference),
        [columns],
    );
    const storedVizConfig =
        config.schemaVersion === 1 ? (config.vizConfig ?? null) : null;
    // v2 draws the presented node through the runQuery chart builders; nothing to edit.
    // Tables draw like every other node's table.
    const runQueryVizConfig =
        config.schemaVersion === 2 && config.vizConfig?.type !== 'table'
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

    const [editedValue, setEditedValue] = useState<AllVizChartConfig | null>(
        null,
    );
    // The last chart viz config, restored when leaving the table.
    const [rememberedChart, setRememberedChart] =
        useState<AllVizChartConfig | null>(null);
    const isResultReady = !isLoading && !results.error && !runError;
    const value = isResultReady
        ? (editedValue ?? derivedValue)
        : (editedValue ?? storedVizConfig ?? derivedValue);
    const options = useMemo(
        (): ComposerVizPanelOptions =>
            getComposerVizPanelOptions(value, columns, rows),
        [value, columns, rows],
    );

    const saveSoon = useDebouncedCallback(
        (next: AllVizChartConfig) => onSaveVizConfig?.(next),
        { delay: SAVE_DELAY_MS, flushOnUnmount: true },
    );
    const isWritable = onSaveVizConfig !== null;
    const setValue = (next: AllVizChartConfig) => {
        setEditedValue(next);
        if (isWritable) saveSoon(next);
    };
    const changeKind = (kind: ComposerVizKind) => {
        if (value.type !== ChartKind.TABLE) setRememberedChart(value);
        setValue(
            switchComposerVizKind(value, kind, {
                columns,
                rows,
                node: displayedNode,
                remembered: rememberedChart,
            }),
        );
    };

    // Chart panel hidden until its design is settled.
    const hasVizConfigPanel = false;
    const panelMode = ((): AiComposerVizConfigPanelMode => {
        if (!isResultReady || options.kinds.length <= 1) return 'static';
        return 'expandable';
    })();
    const fieldsDisabledReason = isWritable ? null : READ_ONLY_REASON;
    const [isChartOpen, setIsChartOpen] = useState(false);

    const isRunQueryChart =
        source.kind === 'artifact' &&
        !!runQueryVizConfig &&
        !!queryUuid &&
        !runError &&
        !results.error;
    // The ref is only set for chart types that export as an image.
    const canExportImage =
        view === 'chart' &&
        isRunQueryChart &&
        !isEmbed &&
        !!canExportData &&
        !!imageExportRef;
    const canDownloadResults = isEmbed
        ? ability.can('view', 'EmbedCsvExport')
        : !!canExportData;
    // Downloads the displayed node's result as run, like an embedded classic artifact
    const downloadQueryUuid = isResultReady ? (queryUuid ?? null) : null;

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
            <Group gap="xs" className={styles.headRight}>
                <SegmentedControl
                    size="xs"
                    value={view}
                    onChange={(next) =>
                        setView(next === 'lineage' ? 'lineage' : 'chart')
                    }
                    data={[
                        {
                            label: getUiString('aiAgent.composer.view.chart'),
                            value: 'chart',
                        },
                        {
                            label: getUiString('aiAgent.composer.view.lineage'),
                            value: 'lineage',
                        },
                    ]}
                />
                {(canExportImage || canDownloadResults) && (
                    <Menu withArrow position="bottom-end">
                        <Menu.Target>
                            <ActionIcon
                                size="sm"
                                aria-label={getUiString(
                                    'aiAgent.composer.actions.quickActions',
                                )}
                            >
                                <MantineIcon icon={IconDots} size="lg" />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>
                                {getUiString(
                                    'aiAgent.composer.actions.quickActions',
                                )}
                            </Menu.Label>
                            {canExportImage && (
                                <AiChartImageExportMenuItem
                                    onClick={openExportImageModal}
                                />
                            )}
                            {canDownloadResults && (
                                <Menu.Item
                                    disabled={!downloadQueryUuid}
                                    onClick={openDownloadModal}
                                    leftSection={
                                        <MantineIcon icon={IconTableExport} />
                                    }
                                >
                                    {getUiString(
                                        'aiAgent.composer.actions.downloadResults',
                                    )}
                                </Menu.Item>
                            )}
                        </Menu.Dropdown>
                    </Menu>
                )}
                {onClose && (
                    <ActionIcon size="sm" onClick={onClose} aria-label="Close">
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )}
            </Group>
        </Box>
    );

    const visualization = isRunQueryChart ? (
        <AiComposerRunQueryVisualization
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            artifactUuid={source.artifactUuid}
            versionUuid={source.versionUuid}
            nodeResults={results}
            chartStage={run?.chartStage ?? null}
            vizConfig={runQueryVizConfig}
            metadata={metadata}
            headerContent={null}
            setImageExportRef={setImageExportRef}
        />
    ) : (
        <AiComposerArtifactVisualization
            projectUuid={projectUuid}
            results={results}
            queryUuid={queryUuid ?? null}
            runError={runError}
            onRerun={onRerun}
            vizConfig={value}
            headerContent={null}
        />
    );

    const lineage = (
        <AiComposerLineage
            projectUuid={projectUuid}
            queries={config.queries}
            terminalNodeId={config.terminalNodeId}
            displayableNodeIds={displayableNodeIds}
            nodeStatuses={nodeStatuses}
            renderNodeResult={(nodeId) => {
                const nodeQueryUuid = nodeQueryUuids?.[nodeId];
                return nodeQueryUuid ? (
                    <AiComposerNodeResult
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        source={source}
                        queryUuid={nodeQueryUuid}
                        query={
                            config.queries.find(
                                (node) => node.nodeId === nodeId,
                            ) ?? null
                        }
                    />
                ) : null;
            }}
            chatNodeIds={chatNodeIds}
            onAddToChat={onAddToChat}
        />
    );

    const chart = hasVizConfigPanel ? (
        <AiComposerVizConfigPanel
            value={value}
            columns={columns}
            options={options}
            onChange={setValue}
            onKindChange={changeKind}
            mode={panelMode}
            expanded={isChartOpen}
            onExpandedChange={setIsChartOpen}
            fieldsDisabledReason={fieldsDisabledReason}
        >
            {visualization}
        </AiComposerVizConfigPanel>
    ) : (
        visualization
    );

    return (
        <Box className={styles.floatingPanel}>
            <Box className={clsx(styles.floatingContent, styles.flushContent)}>
                <Stack gap="md" h="100%" mih={0}>
                    {head}
                    <Box flex={1} mih={0}>
                        {view === 'lineage' ? lineage : chart}
                    </Box>
                </Stack>
            </Box>
            <AiChartImageExportModal
                chartRef={imageExportRef}
                chartName={title}
                opened={exportImageModalOpened}
                onClose={closeExportImageModal}
            />
            {downloadQueryUuid && (
                <ExportDataModal
                    isOpen={downloadModalOpened}
                    onClose={closeDownloadModal}
                    projectUuid={projectUuid}
                    totalResults={results.totalResults}
                    getDownloadQueryUuid={async () => downloadQueryUuid}
                    columnOrder={columnOrder}
                    chartName={title}
                    hideLimitSelection
                />
            )}
        </Box>
    );
};
