import { subject } from '@casl/ability';
import {
    type AiAgentMessageAssistant,
    type AiArtifact,
    type ApiError,
    type MergeQuery,
    type ParametersValuesMap,
    type SavedChart,
} from '@lightdash/common';
import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChartBar,
    IconCircleCheck,
    IconCircleCheckFilled,
    IconDeviceFloppy,
    IconDots,
    IconExternalLink,
    IconEye,
    IconLayoutDashboard,
    IconSend,
    IconTableExport,
    IconTableShortcut,
    IconTerminal2,
} from '@tabler/icons-react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CHART_TYPES_WITHOUT_IMAGE_EXPORT } from '../../../../../components/common/ChartDownload/chartDownloadUtils';
import CodeBlock from '../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { SaveToSpaceOrDashboard } from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { useVisualizationContext } from '../../../../../components/LightdashVisualization/useVisualizationContext';
import useEmbed from '../../../../../ee/providers/Embed/useEmbed';
import {
    MERGE_URL_PARAM,
    serializeMergeState,
} from '../../../../../features/mergeQuery/context/mergeUrlState';
import { toSavedMerge } from '../../../../../features/mergeQuery/hooks/useSavedMerge';
import useToaster from '../../../../../hooks/toaster/useToaster';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
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
import {
    canonicalizeAiMerge,
    remapFieldIdsDeep,
} from '../../utils/canonicalizeAiMerge';
import { AiChartDownloadModal } from './AiChartDownloadModal';
import {
    AiChartImageExportMenuItem,
    AiChartImageExportModal,
} from './AiChartImageExport';
import { AiScheduleDeliveryModal } from './AiScheduleDeliveryModal';

type Props = {
    projectUuid: string;
    agentUuid: string;
    showDownloadResults: boolean;
    saveChartOptions?: {
        name: string | null;
        description: string | null;
        linkToMessage: boolean;
    };
    message: AiAgentMessageAssistant;
    compiledSql?: string;
    artifactData?: AiArtifact;
    /** Set for merge artifacts; `query` is null until the viz query loads. */
    merge: {
        query: MergeQuery | null;
        parameters: ParametersValuesMap | undefined;
    } | null;
};

export const AiChartQuickOptions = ({
    projectUuid,
    agentUuid,
    showDownloadResults,
    saveChartOptions = { name: '', description: '', linkToMessage: true },
    message,
    compiledSql,
    artifactData,
    merge,
}: Props) => {
    const { track } = useTracking();
    const { user } = useApp();
    const { content, writeActions } = useEmbed();
    const isEmbed = isEmbedAiAgentRoute();
    const location = useLocation();
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();

    const dispatch = useAiAgentStoreDispatch();
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    const addChartToDashboard = useAddChartToDashboard(projectUuid);
    const [isSavingToDashboard, setIsSavingToDashboard] = useState(false);

    const [opened, { open, close }] = useDisclosure(false);
    const [scheduleOpened, { open: openSchedule, close: closeSchedule }] =
        useDisclosure(false);
    const [
        verifyModalOpened,
        { open: openVerifyModal, close: closeVerifyModal },
    ] = useDisclosure(false);
    const [sqlModalOpened, { open: openSqlModal, close: closeSqlModal }] =
        useDisclosure(false);
    const [
        exportImageModalOpened,
        { open: openExportImageModal, close: closeExportImageModal },
    ] = useDisclosure(false);
    const [
        downloadModalOpened,
        { open: openDownloadModal, close: closeDownloadModal },
    ] = useDisclosure(false);

    const canCreateScheduledDeliveries = user.data?.ability?.can(
        'create',
        subject('ScheduledDeliveries', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    // The save modal only lists spaces the user can write to, so without one
    // the option opens an empty space picker.
    const canSaveChart = useCreateInAnySpaceAccess(projectUuid, 'SavedChart');
    const canUseSqlRunner = user.data?.ability?.can(
        'manage',
        subject('SqlRunner', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const canExportData = user.data?.ability?.can(
        'manage',
        subject('ExportCsv', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const canDownloadResults = showDownloadResults && !isEmbed && canExportData;
    const {
        visualizationConfig,
        columnOrder,
        resultsData,
        chartConfig,
        pivotDimensions,
        chartRef,
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
    const canExportImage =
        artifactData?.artifactType === 'chart' &&
        !isEmbed &&
        !!type &&
        !CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(type) &&
        canExportData;

    // Renamed to the merge editor's conventions so the saved chart and the
    // explore link are indistinguishable from a merge built by hand.
    const canonicalMerge = useMemo(
        () => (merge?.query ? canonicalizeAiMerge(merge.query) : null),
        [merge],
    );

    const savedData = useMemo(() => {
        if (!metricQuery) return undefined;
        // A merged result's own metricQuery is synthetic; the chart persists
        // the primary source's query (always first) plus the stored merge.
        if (merge) {
            if (!canonicalMerge) return undefined;
            const { fieldIdByAiFieldId } = canonicalMerge;
            const [primary] = canonicalMerge.mergeQuery.sources;
            return {
                metricQuery: primary.metricQuery,
                tableName: primary.metricQuery.exploreName,
                chartConfig: remapFieldIdsDeep(chartConfig, fieldIdByAiFieldId),
                tableConfig: {
                    columnOrder: remapFieldIdsDeep(
                        columnOrder,
                        fieldIdByAiFieldId,
                    ),
                },
                pivotConfig: pivotDimensions?.length
                    ? {
                          columns: remapFieldIdsDeep(
                              pivotDimensions,
                              fieldIdByAiFieldId,
                          ),
                      }
                    : undefined,
                merge: toSavedMerge(canonicalMerge.mergeQuery),
                parameters: merge.parameters,
            };
        }
        return {
            metricQuery,
            tableName: metricQuery.exploreName,
            chartConfig,
            tableConfig: { columnOrder },
            pivotConfig: pivotDimensions?.length
                ? { columns: pivotDimensions }
                : undefined,
        };
    }, [
        metricQuery,
        chartConfig,
        columnOrder,
        pivotDimensions,
        merge,
        canonicalMerge,
    ]);

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
        // A merge opens on its primary source with the whole merge carried in
        // the merge search param, landing in the merge editor fully set up.
        if (merge) {
            if (!canonicalMerge || !projectUuid) return undefined;
            const { fieldIdByAiFieldId } = canonicalMerge;
            const [primary, additional] = canonicalMerge.mergeQuery.sources;
            const url = getOpenInExploreUrl({
                metricQuery: primary.metricQuery,
                projectUuid,
                columnOrder: remapFieldIdsDeep(columnOrder, fieldIdByAiFieldId),
                chartConfig: remapFieldIdsDeep(chartConfig, fieldIdByAiFieldId),
                pivotColumns: pivotDimensions?.length
                    ? remapFieldIdsDeep(pivotDimensions, fieldIdByAiFieldId)
                    : undefined,
            });
            const search = new URLSearchParams(url.search);
            search.set(
                MERGE_URL_PARAM,
                serializeMergeState({
                    focus: { kind: 'source', sourceId: primary.id },
                    additionalSources: [
                        {
                            id: additional.id,
                            exploreName: additional.metricQuery.exploreName,
                            dimensions: additional.metricQuery.dimensions,
                            metrics: additional.metricQuery.metrics,
                            filters: additional.metricQuery.filters,
                            additionalMetrics:
                                additional.metricQuery.additionalMetrics,
                            customDimensions:
                                additional.metricQuery.customDimensions,
                        },
                    ],
                    joinParts: canonicalMerge.mergeQuery.joinKey.map(
                        (part) => ({
                            fieldIdBySourceId: part.fieldIdBySourceId,
                        }),
                    ),
                    joinType: canonicalMerge.mergeQuery.joinType,
                }),
            );
            return { pathname: url.pathname, search: search.toString() };
        }
        return getOpenInExploreUrl({
            metricQuery,
            projectUuid,
            columnOrder,
            chartConfig,
            pivotColumns: pivotDimensions,
        });
    }, [
        isDisabled,
        merge,
        canonicalMerge,
        metricQuery,
        projectUuid,
        columnOrder,
        chartConfig,
        pivotDimensions,
    ]);

    const { mutateAsync: createShareUrl } = useCreateShareMutation();

    const handleExploreFromHere = useCallback(async () => {
        if (!openInExploreUrl) return;
        if (isEmbed) {
            if (!metricQuery?.exploreName) return;

            void navigate(
                {
                    pathname: `/embed/${projectUuid}/explore/${encodeURIComponent(
                        metricQuery.exploreName,
                    )}`,
                    search: openInExploreUrl.search,
                },
                {
                    state: {
                        embedBackUrl: `${location.pathname}${location.search}`,
                    },
                },
            );
        } else {
            const shareUrl = await createShareUrl({
                path: openInExploreUrl.pathname,
                params: `?${openInExploreUrl.search}`,
            });
            window.open(`/share/${shareUrl.nanoid}`, '_blank');
        }
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
        isEmbed,
        navigate,
        location.pathname,
        location.search,
        metricQuery?.exploreName,
        createShareUrl,
        user?.data?.userUuid,
        user?.data?.organizationUuid,
        projectUuid,
        agentUuid,
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
    const hasSavedChartAction = !!message.savedQueryUuid && !isEmbed;
    const hasSaveActions =
        !message.savedQueryUuid && (!merge || !!canonicalMerge);
    const canExploreFromEmbed =
        content?.type === 'aiAgent' && content.canExplore === true;
    // The embedded explorer has not been exercised with merge state, so merge
    // artifacts only offer the explore action in the full app.
    const hasExploreAction = merge
        ? !isEmbed && !!canonicalMerge
        : !isEmbed || canExploreFromEmbed;
    const hasSqlActions = !!compiledSql;
    const hasQuickActions =
        canDownloadResults ||
        hasSavedChartAction ||
        hasSaveActions ||
        hasExploreAction ||
        hasSqlActions ||
        canExportImage;

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
            {hasQuickActions && (
                <Menu withArrow position="bottom-end">
                    <Menu.Target>
                        <ActionIcon size="sm" variant="subtle" color="ldGray.9">
                            <MantineIcon icon={IconDots} size="lg" />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Quick actions</Menu.Label>
                        {canExportImage && (
                            <AiChartImageExportMenuItem
                                onClick={openExportImageModal}
                            />
                        )}
                        {canDownloadResults && (
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconTableExport} />
                                }
                                onClick={openDownloadModal}
                            >
                                Download results
                            </Menu.Item>
                        )}
                        {message.savedQueryUuid ? (
                            !isEmbed && (
                                <>
                                    <Menu.Item
                                        component={Link}
                                        to={`/projects/${projectUuid}/saved/${message.savedQueryUuid}`}
                                        target="_blank"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconTableShortcut}
                                            />
                                        }
                                    >
                                        View saved chart
                                    </Menu.Item>
                                    {canCreateScheduledDeliveries && (
                                        <Menu.Item
                                            onClick={openSchedule}
                                            leftSection={
                                                <MantineIcon icon={IconSend} />
                                            }
                                        >
                                            Schedule delivery
                                        </Menu.Item>
                                    )}
                                </>
                            )
                        ) : hasSaveActions ? (
                            <>
                                {quickSaveDashboard && (
                                    <Menu.Item
                                        onClick={() =>
                                            void handleSaveToCurrentDashboard()
                                        }
                                        disabled={
                                            isDisabled || isSavingToDashboard
                                        }
                                        leftSection={
                                            <MantineIcon
                                                icon={IconLayoutDashboard}
                                            />
                                        }
                                    >
                                        Save to current dashboard
                                    </Menu.Item>
                                )}
                                {canSaveChart && (
                                    <Menu.Item
                                        onClick={() => open()}
                                        leftSection={
                                            <MantineIcon
                                                icon={IconDeviceFloppy}
                                            />
                                        }
                                    >
                                        {quickSaveDashboard
                                            ? 'Save to…'
                                            : 'Save'}
                                    </Menu.Item>
                                )}
                            </>
                        ) : null}

                        {hasExploreAction && (
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconExternalLink} />
                                }
                                disabled={isDisabled}
                                onClick={handleExploreFromHere}
                            >
                                Explore from here
                            </Menu.Item>
                        )}

                        {!!compiledSql && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconEye} />}
                                onClick={openSqlModal}
                            >
                                View SQL
                            </Menu.Item>
                        )}

                        {!!compiledSql && !isEmbed && canUseSqlRunner ? (
                            <Menu.Item
                                component={Link}
                                to={{
                                    pathname: `/projects/${projectUuid}/sql-runner`,
                                }}
                                state={{ sql: compiledSql }}
                                leftSection={
                                    <MantineIcon icon={IconTerminal2} />
                                }
                            >
                                Open in SQL Runner
                            </Menu.Item>
                        ) : null}
                    </Menu.Dropdown>
                </Menu>
            )}
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
                {savedData && (
                    <SaveToSpaceOrDashboard
                        projectUuid={projectUuid}
                        savedData={savedData}
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
                )}
            </MantineModal>
            {canDownloadResults && (
                <AiChartDownloadModal
                    opened={downloadModalOpened}
                    onClose={closeDownloadModal}
                    projectUuid={projectUuid}
                    chartName={saveChartOptions.name}
                    mergeQuery={merge?.query ?? null}
                />
            )}
            <AiChartImageExportModal
                chartRef={chartRef}
                chartName={saveChartOptions.name ?? 'Untitled chart'}
                opened={exportImageModalOpened}
                onClose={closeExportImageModal}
            />
            {!!compiledSql && (
                <MantineModal
                    opened={sqlModalOpened}
                    onClose={closeSqlModal}
                    title="SQL"
                    icon={IconEye}
                    size="xl"
                >
                    <CodeBlock
                        code={compiledSql}
                        language="sql"
                        withLineNumbers
                    />
                </MantineModal>
            )}
            <MantineModal
                opened={verifyModalOpened}
                onClose={closeVerifyModal}
                role="alertdialog"
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
            {scheduleOpened && message.savedQueryUuid && (
                <AiScheduleDeliveryModal
                    chartUuid={message.savedQueryUuid}
                    chartName={saveChartOptions.name ?? ''}
                    agentUuid={agentUuid}
                    sourceThreadUuid={message.threadUuid}
                    onClose={closeSchedule}
                />
            )}
        </Fragment>
    );
};
