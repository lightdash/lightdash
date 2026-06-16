import {
    type AiAgentMessageAssistant,
    type AiArtifact,
    type ApiError,
    type SavedChart,
} from '@lightdash/common';
import { ActionIcon, Button, HoverCard, Menu, Tooltip } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { Prism } from '@mantine/prism';
import {
    IconChartBar,
    IconCircleCheck,
    IconCircleCheckFilled,
    IconDeviceFloppy,
    IconDots,
    IconExternalLink,
    IconEye,
    IconLayoutDashboard,
    IconTableShortcut,
    IconTerminal2,
} from '@tabler/icons-react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { SaveToSpaceOrDashboard } from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { useVisualizationContext } from '../../../../../components/LightdashVisualization/useVisualizationContext';
import useEmbed from '../../../../../ee/providers/Embed/useEmbed';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useCreateShareMutation } from '../../../../../hooks/useShare';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { getOpenInExploreUrl } from '../../../../../utils/getOpenInExploreUrl';
import { isEmbedAiAgentRoute } from '../../hooks/aiAgentRouting';
import { useAddChartToDashboard } from '../../hooks/useAddChartToDashboard';
import { useSetArtifactVersionVerified } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import { useSavePromptQuery } from '../../hooks/useProjectAiAgents';
import {
    requestDashboardRefresh,
    type LauncherCurrentDashboard,
} from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';

type Props = {
    projectUuid: string;
    agentUuid: string;
    saveChartOptions?: {
        name: string | null;
        description: string | null;
        linkToMessage: boolean;
    };
    message: AiAgentMessageAssistant;
    compiledSql?: string;
    artifactData?: AiArtifact;
};

export const AiChartQuickOptions = ({
    projectUuid,
    agentUuid,
    saveChartOptions = { name: '', description: '', linkToMessage: true },
    message,
    compiledSql,
    artifactData,
}: Props) => {
    const { track } = useTracking();
    const { user } = useApp();
    const { writeActions } = useEmbed();
    const isEmbed = isEmbedAiAgentRoute();
    const { showToastSuccess, showToastApiError } = useToaster();

    const dispatch = useAiAgentStoreDispatch();
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    const addChartToDashboard = useAddChartToDashboard(projectUuid);
    const [isSavingToDashboard, setIsSavingToDashboard] = useState(false);

    const [opened, { open, close }] = useDisclosure(false);
    const [
        verifyModalOpened,
        { open: openVerifyModal, close: closeVerifyModal },
    ] = useDisclosure(false);
    const {
        visualizationConfig,
        columnOrder,
        resultsData,
        chartConfig,
        pivotDimensions,
    } = useVisualizationContext();
    const { mutate: savePromptQuery } = useSavePromptQuery(
        projectUuid,
        agentUuid!,
        message.threadUuid,
        message.uuid,
    );
    const { mutate: setVerified } = useSetArtifactVersionVerified(
        projectUuid,
        agentUuid!,
    );
    const canManageAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const metricQuery = resultsData?.metricQuery;
    const type = chartConfig.type;

    const isVerified = artifactData?.verifiedByUserUuid !== null;

    const isDisabled = !metricQuery || !type || !visualizationConfig;

    const savedData = useMemo(() => {
        if (!metricQuery) return undefined;
        return {
            metricQuery,
            tableName: metricQuery.exploreName,
            chartConfig,
            tableConfig: { columnOrder },
            pivotConfig: pivotDimensions?.length
                ? { columns: pivotDimensions }
                : undefined,
        };
    }, [metricQuery, chartConfig, columnOrder, pivotDimensions]);

    const trackChartCreated = useCallback(() => {
        if (
            user?.data?.userUuid &&
            user?.data?.organizationUuid &&
            projectUuid &&
            agentUuid &&
            metricQuery?.exploreName
        ) {
            track({
                name: EventName.AI_AGENT_CHART_CREATED,
                properties: {
                    userId: user.data.userUuid,
                    organizationId: user.data.organizationUuid,
                    projectId: projectUuid,
                    aiAgentId: agentUuid,
                    threadId: message.threadUuid,
                    messageId: message.uuid,
                    tableName: metricQuery.exploreName,
                },
            });
        }
    }, [
        user?.data?.userUuid,
        user?.data?.organizationUuid,
        projectUuid,
        agentUuid,
        metricQuery?.exploreName,
        track,
        message.threadUuid,
        message.uuid,
    ]);

    const onSaveChart = (chart: SavedChart) => {
        if (!saveChartOptions.linkToMessage) {
            close();
            return;
        }
        savePromptQuery({ savedQueryUuid: chart.uuid });
        trackChartCreated();
        close();
    };

    const quickSaveDashboard: LauncherCurrentDashboard | null =
        currentDashboard?.projectUuid === projectUuid ? currentDashboard : null;

    const handleSaveToCurrentDashboard = useCallback(async () => {
        if (!savedData || !quickSaveDashboard) return;
        setIsSavingToDashboard(true);
        try {
            const chart = await addChartToDashboard({
                savedData,
                name: saveChartOptions.name ?? 'Untitled chart',
                description: saveChartOptions.description,
                dashboardUuid: quickSaveDashboard.uuid,
                activeTabUuid: quickSaveDashboard.activeTabUuid,
            });
            if (saveChartOptions.linkToMessage) {
                savePromptQuery({ savedQueryUuid: chart.uuid });
            }
            trackChartCreated();
            dispatch(
                requestDashboardRefresh({
                    dashboardUuid: quickSaveDashboard.uuid,
                    focusChartSlug: chart.slug,
                }),
            );
            showToastSuccess({
                title: `Chart added to "${quickSaveDashboard.name}"`,
            });
        } catch (e) {
            showToastApiError({
                title: 'Failed to add chart to dashboard',
                apiError: (e as ApiError).error,
            });
        } finally {
            setIsSavingToDashboard(false);
        }
    }, [
        savedData,
        quickSaveDashboard,
        addChartToDashboard,
        saveChartOptions.name,
        saveChartOptions.description,
        saveChartOptions.linkToMessage,
        savePromptQuery,
        trackChartCreated,
        dispatch,
        showToastSuccess,
        showToastApiError,
    ]);

    const openInExploreUrl = useMemo(() => {
        if (isDisabled) return undefined;
        return getOpenInExploreUrl({
            metricQuery,
            projectUuid,
            columnOrder,
            chartConfig,
            pivotColumns: pivotDimensions,
        });
    }, [
        isDisabled,
        metricQuery,
        projectUuid,
        columnOrder,
        chartConfig,
        pivotDimensions,
    ]);

    const { mutateAsync: createShareUrl } = useCreateShareMutation();

    const handleExploreFromHere = useCallback(async () => {
        if (!openInExploreUrl) return;
        const shareUrl = await createShareUrl({
            path: openInExploreUrl.pathname,
            params: `?${openInExploreUrl.search}`,
        });
        window.open(`/share/${shareUrl.nanoid}`, '_blank');
        if (
            user?.data?.userUuid &&
            user?.data?.organizationUuid &&
            projectUuid &&
            agentUuid &&
            metricQuery?.exploreName
        ) {
            track({
                name: EventName.AI_AGENT_CHART_EXPLORED,
                properties: {
                    userId: user.data.userUuid,
                    organizationId: user.data.organizationUuid,
                    projectId: projectUuid,
                    aiAgentId: agentUuid,
                    threadId: message.threadUuid,
                    messageId: message.uuid,
                    tableName: metricQuery.exploreName,
                },
            });
        }
    }, [
        openInExploreUrl,
        createShareUrl,
        user?.data?.userUuid,
        user?.data?.organizationUuid,
        projectUuid,
        agentUuid,
        metricQuery?.exploreName,
        track,
        message.threadUuid,
        message.uuid,
    ]);

    const handleVerifyToggle = () => {
        if (!artifactData) return;

        if (isVerified) {
            openVerifyModal();
        } else {
            setVerified({
                artifactUuid: artifactData.artifactUuid,
                versionUuid: artifactData.versionUuid,
                verified: true,
            });
        }
    };

    const handleConfirmUnverify = () => {
        if (!artifactData) return;
        setVerified({
            artifactUuid: artifactData.artifactUuid,
            versionUuid: artifactData.versionUuid,
            verified: false,
        });
        closeVerifyModal();
    };

    if (!metricQuery) return null;

    const canVerify = !!artifactData && canManageAgent;

    return (
        <Fragment>
            {canVerify && (
                <Tooltip
                    label={
                        isVerified
                            ? 'Remove from verified answers'
                            : 'Add to verified answers'
                    }
                    position="bottom"
                >
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color={isVerified ? 'green' : 'ldGray.6'}
                        onClick={handleVerifyToggle}
                    >
                        <MantineIcon
                            icon={
                                isVerified
                                    ? IconCircleCheckFilled
                                    : IconCircleCheck
                            }
                            size="lg"
                        />
                    </ActionIcon>
                </Tooltip>
            )}
            <Menu withArrow position="bottom-end">
                <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="ldGray.9">
                        <MantineIcon icon={IconDots} size="lg" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Quick actions</Menu.Label>
                    {message.savedQueryUuid ? (
                        <Menu.Item
                            component={Link}
                            to={`/projects/${projectUuid}/saved/${message.savedQueryUuid}`}
                            target="_blank"
                            leftSection={
                                <MantineIcon icon={IconTableShortcut} />
                            }
                        >
                            View saved chart
                        </Menu.Item>
                    ) : (
                        <>
                            {quickSaveDashboard && (
                                <Menu.Item
                                    onClick={() =>
                                        void handleSaveToCurrentDashboard()
                                    }
                                    disabled={isDisabled || isSavingToDashboard}
                                    leftSection={
                                        <MantineIcon
                                            icon={IconLayoutDashboard}
                                        />
                                    }
                                >
                                    Save to current dashboard
                                </Menu.Item>
                            )}
                            <Menu.Item
                                onClick={() => open()}
                                leftSection={
                                    <MantineIcon icon={IconDeviceFloppy} />
                                }
                            >
                                {quickSaveDashboard ? 'Save to…' : 'Save'}
                            </Menu.Item>
                        </>
                    )}

                    <Menu.Item
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                        disabled={isDisabled}
                        onClick={handleExploreFromHere}
                    >
                        Explore from here
                    </Menu.Item>

                    {!!compiledSql && (
                        <HoverCard
                            shadow="subtle"
                            radius="md"
                            position="left-start"
                            withinPortal
                            openDelay={120}
                        >
                            <HoverCard.Target>
                                <Menu.Item
                                    leftSection={<MantineIcon icon={IconEye} />}
                                    closeMenuOnClick={false}
                                >
                                    View SQL
                                </Menu.Item>
                            </HoverCard.Target>
                            <HoverCard.Dropdown p={0} maw={500}>
                                <Prism
                                    language="sql"
                                    withLineNumbers
                                    noCopy
                                    styles={{
                                        lineContent: {
                                            fontSize: 10,
                                        },
                                    }}
                                >
                                    {compiledSql}
                                </Prism>
                            </HoverCard.Dropdown>
                        </HoverCard>
                    )}

                    {!!compiledSql ? (
                        <Menu.Item
                            component={Link}
                            to={{
                                pathname: `/projects/${projectUuid}/sql-runner`,
                            }}
                            state={{ sql: compiledSql }}
                            leftSection={<MantineIcon icon={IconTerminal2} />}
                        >
                            Open in SQL Runner
                        </Menu.Item>
                    ) : null}
                </Menu.Dropdown>
            </Menu>
            <MantineModal
                opened={opened}
                onClose={close}
                title="Save chart"
                icon={IconChartBar}
                size="lg"
                modalBodyProps={{
                    px: 0,
                    py: 0,
                }}
                modalRootProps={{
                    closeOnClickOutside: false,
                }}
            >
                <SaveToSpaceOrDashboard
                    projectUuid={projectUuid}
                    savedData={{
                        metricQuery: metricQuery,
                        tableName: metricQuery.exploreName,
                        chartConfig,
                        tableConfig: { columnOrder },
                        pivotConfig: pivotDimensions?.length
                            ? { columns: pivotDimensions }
                            : undefined,
                    }}
                    onConfirm={onSaveChart}
                    onClose={close}
                    chartMetadata={{
                        name: saveChartOptions.name ?? '',
                        description: saveChartOptions.description ?? '',
                    }}
                    forcedSpaceUuid={
                        isEmbed ? writeActions?.spaceUuid : undefined
                    }
                    redirectOnSuccess={false}
                />
            </MantineModal>
            <MantineModal
                opened={verifyModalOpened}
                onClose={closeVerifyModal}
                title="Remove from verified answers"
                icon={IconCircleCheck}
                size="sm"
                description="Are you sure you want to remove this answer from verified answers? It will no longer be used as an example in future Agent responses."
                actions={
                    <Button color="red" onClick={handleConfirmUnverify}>
                        Confirm
                    </Button>
                }
            />
        </Fragment>
    );
};
