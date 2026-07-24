import {
    AiResultType,
    getGroupByDimensions,
    getWebAiChartConfig,
    isAiAgentSqlArtifactVizQuery,
    isAiSqlChartArtifactConfig,
    parseVizConfig,
    type AiAgentChartTypeOption,
    type AiAgentMessageAssistant,
    type AiSemanticChartArtifactConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Divider,
    Group,
    Loader,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconExclamationCircle, IconX } from '@tabler/icons-react';
import { memo, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import useHealth from '../../../../../hooks/health/useHealth';
import { useCompiledSqlFromMetricQuery } from '../../../../../hooks/useCompiledSql';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
import {
    useAiAgentArtifactVizQuery,
    useAiAgentThread,
} from '../../hooks/useProjectAiAgents';
import { clearArtifact } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import styles from './AiArtifactPanel.module.css';
import { AiChartQuickOptions } from './AiChartQuickOptions';
import { AiChartVisualization } from './AiChartVisualization';
import { AiDashboardVisualization } from './AiDashboardVisualization';
import {
    AiSqlArtifactActions,
    AiSqlArtifactVisualization,
} from './AiSqlArtifactVisualization';
import { AiVisualizationRenderer } from './AiVisualizationRenderer';
import { ChatElementsUtils } from './utils';

type ArtifactRef = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    messageUuid: string;
    threadUuid: string;
};

type AiArtifactPanelProps = {
    artifact: ArtifactRef;
    showCloseButton?: boolean;
    // `floating` (default) = chromeless floating card with pill toolbar.
    // `inline`             = legacy inline rendering for admin views.
    variant?: 'floating' | 'inline';
};

export const AiArtifactPanel: FC<AiArtifactPanelProps> = memo(
    ({ artifact, showCloseButton = true, variant = 'floating' }) => {
        const dispatch = useAiAgentStoreDispatch();
        const { data: health } = useHealth();

        const {
            data: artifactData,
            isLoading: isArtifactLoading,
            error: artifactError,
        } = useAiAgentArtifact({
            projectUuid: artifact.projectUuid,
            agentUuid: artifact.agentUuid,
            artifactUuid: artifact.artifactUuid,
            versionUuid: artifact.versionUuid,
        });

        const { data: thread } = useAiAgentThread(
            artifact.projectUuid,
            artifact.agentUuid,
            artifact.threadUuid,
        );

        const message = useMemo(
            () =>
                thread?.messages.find(
                    (msg) =>
                        msg.role === 'assistant' &&
                        msg.uuid === artifact.messageUuid,
                ) as AiAgentMessageAssistant | undefined,
            [thread?.messages, artifact.messageUuid],
        );

        // Floating-variant only: lift chart-type selection to the panel so
        // the floating pill at the bottom edge is the visible switcher.
        const [selectedChartType, setSelectedChartType] =
            useState<AiAgentChartTypeOption | null>(null);

        const isFloatingChart =
            variant === 'floating' &&
            artifactData?.artifactType === 'chart' &&
            !!artifactData.chartConfig;

        const isSqlArtifact = isAiSqlChartArtifactConfig(
            artifactData?.chartConfig,
        );
        const semanticChartConfig = isSqlArtifact
            ? null
            : (artifactData?.chartConfig as
                  | AiSemanticChartArtifactConfig
                  | null
                  | undefined);

        const vizConfig = useMemo(() => {
            if (!isFloatingChart || !semanticChartConfig) return null;
            return parseVizConfig(semanticChartConfig);
        }, [isFloatingChart, semanticChartConfig]);

        const queryExecutionHandle = useAiAgentArtifactVizQuery(
            {
                projectUuid: artifact.projectUuid,
                agentUuid: artifact.agentUuid,
                artifactUuid: artifact.artifactUuid,
                versionUuid: artifact.versionUuid,
            },
            { enabled: (isFloatingChart && !!vizConfig) || isSqlArtifact },
        );

        const semanticVizQueryData =
            queryExecutionHandle.data &&
            !isAiAgentSqlArtifactVizQuery(queryExecutionHandle.data)
                ? queryExecutionHandle.data
                : undefined;
        const sqlVizQueryData =
            queryExecutionHandle.data &&
            isAiAgentSqlArtifactVizQuery(queryExecutionHandle.data)
                ? queryExecutionHandle.data
                : undefined;
        const queryUuid =
            sqlVizQueryData?.queryUuid ?? semanticVizQueryData?.query.queryUuid;

        const queryResults = useInfiniteQueryResults(
            artifact.projectUuid,
            queryUuid,
        );

        const { data: compiledSql } = useCompiledSqlFromMetricQuery({
            tableName: semanticVizQueryData?.query.metricQuery?.exploreName,
            projectUuid: artifact.projectUuid,
            metricQuery: semanticVizQueryData?.query.metricQuery,
        });

        // Same parse the renderer does — needed so the floating pill can
        // show the correct default selection and know whether to render
        // at all (only QUERY_RESULT artifacts support the switcher).
        const parsedChartConfig = useMemo(() => {
            if (!isFloatingChart) return null;
            if (
                !semanticVizQueryData ||
                !semanticChartConfig ||
                !semanticVizQueryData.query.metricQuery
            ) {
                return null;
            }
            return getWebAiChartConfig({
                vizConfig: semanticChartConfig,
                metricQuery: semanticVizQueryData.query.metricQuery,
                maxQueryLimit: health?.query.maxLimit,
                fieldsMap: semanticVizQueryData.query.fields,
                overrideChartType: selectedChartType ?? undefined,
            });
        }, [
            isFloatingChart,
            semanticVizQueryData,
            semanticChartConfig,
            health?.query.maxLimit,
            selectedChartType,
        ]);

        const defaultChartType: AiAgentChartTypeOption =
            parsedChartConfig?.type === AiResultType.QUERY_RESULT
                ? (parsedChartConfig.vizTool.chartConfig?.defaultVizType ??
                  'table')
                : 'table';

        const effectiveChartType = selectedChartType ?? defaultChartType;

        const groupByDimensions = parsedChartConfig
            ? getGroupByDimensions(parsedChartConfig)
            : undefined;

        const shouldShowPill =
            parsedChartConfig?.type === AiResultType.QUERY_RESULT;

        if (isArtifactLoading || !message) {
            return (
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Center className={styles.loading}>
                        <Loader
                            type="dots"
                            color="gray"
                            delayedMessage="Loading artifact..."
                        />
                    </Center>
                </Box>
            );
        }

        const isError =
            artifactError ||
            !artifactData ||
            (artifactData.artifactType === 'dashboard' &&
                !artifactData.dashboardConfig) ||
            (artifactData.artifactType === 'chart' &&
                !artifactData.chartConfig);

        if (isError) {
            return (
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Stack gap="xs" align="center" justify="center">
                        <MantineIcon
                            icon={IconExclamationCircle}
                            color="gray"
                        />
                        <Text size="xs" c="dimmed" ta="center">
                            Failed to load artifact. Please try again.
                        </Text>
                    </Stack>
                </Box>
            );
        }

        // Dashboards share the floating panel chrome with chart artifacts
        // for visual parity, but skip the per-tile floating pill (each
        // tile has its own inline switcher inside its Card).
        if (artifactData.artifactType === 'dashboard') {
            return (
                <div className={styles.floatingPanel}>
                    <div className={styles.dashboardContent}>
                        <AiDashboardVisualization
                            artifactData={artifactData}
                            projectUuid={artifact.projectUuid}
                            agentUuid={artifact.agentUuid}
                            dashboardConfig={artifactData.dashboardConfig!}
                            message={message}
                            showCloseButton={showCloseButton}
                        />
                    </div>
                </div>
            );
        }

        // Inline variant (admin verified-content view): no floating chrome,
        // no pill — legacy chrome owned by AiChartVisualization.
        if (variant === 'inline' && !isSqlArtifact) {
            return (
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Stack gap="md" h="100%">
                        <AiChartVisualization
                            artifactData={artifactData}
                            projectUuid={artifact.projectUuid}
                            agentUuid={artifact.agentUuid}
                            artifactUuid={artifact.artifactUuid}
                            versionUuid={artifact.versionUuid}
                            message={message}
                            showCloseButton={showCloseButton}
                        />
                    </Stack>
                </Box>
            );
        }

        // Floating chart artifact: chromeless head + chart + floating pill.
        // Wait for the viz query data so the renderer mounts with valid
        // inputs.
        if (
            queryExecutionHandle.isLoading ||
            (!isSqlArtifact && queryResults.isFetchingRows) ||
            !queryExecutionHandle.data ||
            queryResults.error
        ) {
            return (
                <div className={styles.floatingPanel}>
                    <Center className={styles.loading}>
                        <Loader
                            type="dots"
                            color="gray"
                            delayedMessage="Loading visualization..."
                        />
                    </Center>
                </div>
            );
        }

        const title =
            queryExecutionHandle.data.metadata.title ?? 'Untitled chart';
        const description =
            queryExecutionHandle.data.metadata.description ?? null;
        const metricQuery = semanticVizQueryData?.query.metricQuery;

        const floatingHead = (
            <div className={styles.head}>
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
                <Group gap={2} className={styles.headRight}>
                    {sqlVizQueryData ? (
                        <AiSqlArtifactActions
                            projectUuid={artifact.projectUuid}
                            sql={sqlVizQueryData.sql}
                            limit={sqlVizQueryData.limit}
                        />
                    ) : (
                        <AiChartQuickOptions
                            message={message}
                            projectUuid={artifact.projectUuid}
                            agentUuid={artifact.agentUuid}
                            artifactData={artifactData}
                            saveChartOptions={{
                                name: title,
                                description: description,
                                linkToMessage: true,
                            }}
                            compiledSql={compiledSql?.query}
                        />
                    )}
                    {showCloseButton && (
                        <>
                            <Divider
                                orientation="vertical"
                                color="ldGray.3"
                                mx={4}
                                my={4}
                            />
                            <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="ldGray.6"
                                onClick={() => dispatch(clearArtifact())}
                                aria-label="Close"
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </>
                    )}
                </Group>
            </div>
        );

        if (isAiAgentSqlArtifactVizQuery(queryExecutionHandle.data)) {
            return (
                <div className={styles.floatingPanel}>
                    <div
                        className={`${styles.floatingContent} ${styles.sqlArtifactContent}`}
                    >
                        <AiSqlArtifactVisualization
                            projectUuid={artifact.projectUuid}
                            vizQueryData={queryExecutionHandle.data}
                            results={queryResults}
                            headerContent={floatingHead}
                        />
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.floatingPanel}>
                <div className={styles.floatingContent}>
                    <AiVisualizationRenderer
                        vizQueryData={semanticVizQueryData!}
                        results={queryResults}
                        chartConfig={semanticChartConfig!}
                        selectedChartType={selectedChartType}
                        headerContent={floatingHead}
                    />
                </div>
                {shouldShowPill && metricQuery && (
                    <Box className={styles.floatingPill}>
                        <AgentVisualizationChartTypeSwitcher
                            metricQuery={metricQuery}
                            selectedChartType={effectiveChartType}
                            hasGroupByDimensions={
                                (groupByDimensions?.length ?? 0) > 0
                            }
                            onChartTypeChange={setSelectedChartType}
                            variant="pill"
                        />
                    </Box>
                )}
            </div>
        );
    },
);
