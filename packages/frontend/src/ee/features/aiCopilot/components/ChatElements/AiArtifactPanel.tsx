import {
    AiResultType,
    getGroupByDimensions,
    getWebAiChartConfig,
    parseVizConfig,
    type AiAgentChartTypeOption,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconExclamationCircle,
    IconInfoCircle,
    IconX,
} from '@tabler/icons-react';
import { motion } from 'motion/react';
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
import { AiVisualizationProviders } from './AiVisualizationProviders';
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

// Snappy, low-drama easing so the button→panel morph doesn't feel heavy.
const MORPH_TRANSITION = {
    layout: { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const },
};

type AiArtifactPanelProps = {
    artifact: ArtifactRef;
    showCloseButton?: boolean;
    // `floating` (default) = chromeless floating card with morph + pill.
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

        const vizConfig = useMemo(() => {
            if (!isFloatingChart || !artifactData?.chartConfig) return null;
            return parseVizConfig(artifactData.chartConfig);
        }, [isFloatingChart, artifactData?.chartConfig]);

        const queryExecutionHandle = useAiAgentArtifactVizQuery(
            {
                projectUuid: artifact.projectUuid,
                agentUuid: artifact.agentUuid,
                artifactUuid: artifact.artifactUuid,
                versionUuid: artifact.versionUuid,
            },
            { enabled: isFloatingChart && !!vizConfig },
        );

        const queryResults = useInfiniteQueryResults(
            artifact.projectUuid,
            queryExecutionHandle?.data?.query.queryUuid,
        );

        const { data: compiledSql } = useCompiledSqlFromMetricQuery({
            tableName:
                queryExecutionHandle?.data?.query.metricQuery?.exploreName,
            projectUuid: artifact.projectUuid,
            metricQuery: queryExecutionHandle?.data?.query.metricQuery,
        });

        // Same parse the renderer does — needed so the floating pill can
        // show the correct default selection and know whether to render
        // at all (only QUERY_RESULT artifacts support the switcher).
        const parsedChartConfig = useMemo(() => {
            if (!isFloatingChart) return null;
            if (
                !queryExecutionHandle.data ||
                !artifactData?.chartConfig ||
                !queryExecutionHandle.data.query.metricQuery
            ) {
                return null;
            }
            return getWebAiChartConfig({
                vizConfig: artifactData.chartConfig,
                metricQuery: queryExecutionHandle.data.query.metricQuery,
                maxQueryLimit: health?.query.maxLimit,
                fieldsMap: queryExecutionHandle.data.query.fields,
                overrideChartType: selectedChartType ?? undefined,
            });
        }, [
            isFloatingChart,
            queryExecutionHandle.data,
            artifactData?.chartConfig,
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

        const layoutId = `ai-artifact-${artifact.artifactUuid}-${artifact.versionUuid}`;

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

        // Dashboards: out of scope for v2 chrome — keep current rendering.
        if (artifactData.artifactType === 'dashboard') {
            return (
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Stack gap="md" h="100%">
                        <AiDashboardVisualization
                            artifactData={artifactData}
                            projectUuid={artifact.projectUuid}
                            agentUuid={artifact.agentUuid}
                            dashboardConfig={artifactData.dashboardConfig!}
                            message={message}
                            showCloseButton={showCloseButton}
                        />
                    </Stack>
                </Box>
            );
        }

        // Inline variant (admin verified-content view): no morph wrapper,
        // no floating pill — legacy chrome.
        if (variant === 'inline') {
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

        // Floating chart artifact: chromeless head, body, floating pill.
        // Wait for the viz query data so the providers can mount with valid
        // inputs — the head + body share the same viz context.
        if (
            queryExecutionHandle.isLoading ||
            queryResults.isFetchingRows ||
            !queryExecutionHandle.data ||
            queryResults.error
        ) {
            return (
                <motion.div
                    layoutId={layoutId}
                    className={styles.floatingPanel}
                    transition={MORPH_TRANSITION}
                >
                    <div className={styles.floatingInner}>
                        <Center className={styles.loading}>
                            <Loader
                                type="dots"
                                color="gray"
                                delayedMessage="Loading visualization..."
                            />
                        </Center>
                    </div>
                </motion.div>
            );
        }

        const title =
            queryExecutionHandle.data.metadata.title ?? 'Untitled chart';
        const description =
            queryExecutionHandle.data.metadata.description ?? null;
        const metricQuery = queryExecutionHandle.data.query.metricQuery;

        return (
            <motion.div
                layoutId={layoutId}
                className={styles.floatingPanel}
                transition={MORPH_TRANSITION}
            >
                <AiVisualizationProviders
                    vizQueryData={queryExecutionHandle.data}
                    queryResults={queryResults}
                    chartConfig={artifactData.chartConfig!}
                    selectedChartType={selectedChartType}
                >
                    <div className={styles.floatingInner}>
                        <div className={styles.head}>
                            <Box flex="1" miw={0}>
                                <TruncatedText fz="sm" fw={600} maxWidth="100%">
                                    {title}
                                </TruncatedText>
                            </Box>
                            <Group gap={2} className={styles.headRight}>
                                {description && (
                                    <Tooltip
                                        label={description}
                                        multiline
                                        w={260}
                                        withinPortal
                                    >
                                        <ActionIcon
                                            size="sm"
                                            variant="subtle"
                                            color="ldGray.6"
                                            aria-label="Description"
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
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
                                {showCloseButton && (
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="ldGray.6"
                                        onClick={() =>
                                            dispatch(clearArtifact())
                                        }
                                        aria-label="Close"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )}
                            </Group>
                        </div>

                        <div className={styles.body}>
                            <AiVisualizationRenderer
                                vizQueryData={queryExecutionHandle.data}
                                chartConfig={artifactData.chartConfig!}
                                selectedChartType={selectedChartType}
                            />
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
                    </div>
                </AiVisualizationProviders>
            </motion.div>
        );
    },
);
