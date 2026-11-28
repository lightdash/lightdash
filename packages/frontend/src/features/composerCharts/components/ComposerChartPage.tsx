import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ChartKind,
    ContentType,
    getChartKind,
    getComposerChartExportLabels,
    ResourceViewItemType,
    type ApiErrorDetail,
    type ComposerChartWithDetails,
    type ParametersValuesMap,
    type ParameterValue,
    type ResourceViewComposerChartItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Menu,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import * as Sentry from '@sentry/react';
import {
    IconChartHistogram,
    IconDots,
    IconDownload,
    IconEdit,
    IconFolderSymlink,
    IconHierarchy2,
    IconPhoto,
    IconRefresh,
    IconTableExport,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { CHART_TYPES_WITHOUT_IMAGE_EXPORT } from '../../../components/common/ChartDownload/chartDownloadUtils';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import { COLLAPSABLE_CARD_ACTION_ICON_PROPS } from '../../../components/common/CollapsableCard/constants';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import ErrorState from '../../../components/common/ErrorState';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { editorName } from '../../../components/common/Page/editorName';
import { HeaderInfoPopover } from '../../../components/common/Page/HeaderInfoPopover';
import {
    HeaderActions,
    HeaderHeading,
    HeaderMain,
    HeaderTitle,
} from '../../../components/common/Page/HeaderSlots';
import Page from '../../../components/common/Page/Page';
import PageHeader from '../../../components/common/Page/PageHeader';
import TransferItemsModal from '../../../components/common/TransferItemsModal/TransferItemsModal';
import ExportDataModal from '../../../components/DashboardTiles/ExportDataModal';
import ExportImageModal from '../../../components/DashboardTiles/ExportImageModal';
import { type EChartsReact } from '../../../components/EChartsReactWrapper';
import explorerClasses from '../../../components/Explorer/Explorer.module.css';
import { TitleBreadCrumbs } from '../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { NO_CELL_LIMITED_SCOPES } from '../../../components/ExportResults/exportCellEstimate';
import { AskAiAgentButton } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentButton';
import { useRefreshComposerChartOnAgentEdit } from '../../../ee/features/aiCopilot/hooks/useRefreshComposerChartOnAgentEdit';
import { useContentAction } from '../../../hooks/useContent';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { ParameterSelection } from '../../parameters';
import { useCanWriteComposerChart } from '../hooks/useCanWriteComposerChart';
import {
    COMPOSER_CHART_SENTRY_TAGS,
    useComposerChartDraw,
} from '../hooks/useComposerChartDraw';
import {
    useComposerChartPageRun,
    useComposerChartParameters,
} from '../hooks/useComposerChartPage';
import { ComposerRunParametersContext } from '../lineage/composerRunParametersContext';
import { getComposerChartParameterValues } from '../utils/composerChartParameterValues';
import { ComposerChartDeleteModal } from './ComposerChartDeleteModal';
import styles from './ComposerChartPage.module.css';
import { ComposerChartUpdateModal } from './ComposerChartUpdateModal';
import { ComposerChartVisualization } from './ComposerChartVisualization';
import { ComposerTileLineage } from './ComposerTileLineage';

enum View {
    CHART = 'chart',
    LINEAGE = 'lineage',
}

const noop = () => {};

const toErrorDetail = (message: string): ApiErrorDetail => ({
    name: 'Error',
    statusCode: 500,
    message,
    data: {},
});

type Props = {
    projectUuid: string;
    chart: ComposerChartWithDetails;
};

/** A space-owned composer chart on its own page: chart or lineage, refresh, parameters and exports. */
export const ComposerChartPage: FC<Props> = ({ projectUuid, chart }) => {
    const { uuid: composerChartUuid } = chart;
    useRefreshComposerChartOnAgentEdit({ projectUuid, composerChartUuid });
    const composerChartsEnabled =
        useServerFeatureFlag(FeatureFlags.ComposerCharts).data?.enabled ===
        true;
    const [view, setView] = useState<View>(View.CHART);
    // As on a saved chart: the chart starts open, the parameters closed
    const [isChartOpen, setIsChartOpen] = useState(true);
    const [isParametersOpen, setIsParametersOpen] = useState(false);
    const [picks, setPicks] = useState<ParametersValuesMap>({});
    const { runQuery, run, refresh } = useComposerChartPageRun({
        projectUuid,
        chart,
        parameters: picks,
    });
    const parametersQuery = useComposerChartParameters(projectUuid, chart);
    const {
        draw,
        results,
        rows,
        displayedQueryUuid,
        error: drawError,
    } = useComposerChartDraw({
        projectUuid,
        chart,
        run,
        title: chart.name,
    });
    const runError = runQuery.error?.error ?? null;
    const errorMessage = runError?.message ?? drawError;
    const isDrawn =
        errorMessage === null && !!draw && results.hasFetchedAllRows;

    // While a new pick or refresh runs, the previous run stays drawn but is not exported
    const isRunCurrent = !!run && !runQuery.isPreviousData;
    const parameterValues = useMemo(
        () =>
            getComposerChartParameterValues({
                nodes: chart.pipeline.nodes,
                usedParameterValuesByNodeId:
                    run?.usedParameterValuesByNodeId ?? null,
                picks,
                isRunCurrent,
            }),
        [chart.pipeline.nodes, run, picks, isRunCurrent],
    );
    const handleParameterChange = useCallback(
        (key: string, value: ParameterValue | null) => {
            setPicks(({ [key]: _, ...rest }) =>
                value === null ? rest : { ...rest, [key]: value },
            );
        },
        [],
    );
    const handleClearParameters = useCallback(() => setPicks({}), []);
    const hasParameters =
        Object.keys(parametersQuery.data?.parameterDefinitions ?? {}).length >
        0;

    const { user } = useApp();
    const canExportData = !!user.data?.ability?.can(
        'manage',
        subject('ExportCsv', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const canExportImage =
        canExportData &&
        isChartOpen &&
        view === View.CHART &&
        isDrawn &&
        isRunCurrent &&
        !CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(draw.chartConfig.type);
    const exportQueryUuid = isDrawn && isRunCurrent ? displayedQueryUuid : null;
    const [echartRef, setEchartRef] = useState<
        RefObject<EChartsReact | null> | undefined
    >();
    const [exportOpened, { open: openExport, close: closeExport }] =
        useDisclosure(false);
    const [
        imageExportOpened,
        { open: openImageExport, close: closeImageExport },
    ] = useDisclosure(false);
    const canWrite = useCanWriteComposerChart(projectUuid, chart.space.uuid);
    const [renameOpened, { open: openRename, close: closeRename }] =
        useDisclosure(false);
    const [moveOpened, { open: openMove, close: closeMove }] =
        useDisclosure(false);
    const [deleteOpened, { open: openDelete, close: closeDelete }] =
        useDisclosure(false);
    const navigate = useNavigate();
    const { mutateAsync: contentAction, isLoading: isMoving } =
        useContentAction(projectUuid);
    const moveItem = useMemo(
        (): ResourceViewComposerChartItem => ({
            type: ResourceViewItemType.COMPOSER_CHART,
            data: {
                uuid: composerChartUuid,
                slug: chart.slug,
                name: chart.name,
                description: chart.description ?? undefined,
                spaceUuid: chart.space.uuid,
                projectUuid,
                organizationUuid: user.data?.organizationUuid ?? '',
                chartKind:
                    getChartKind(
                        chart.chart.chartConfig.type,
                        chart.chart.chartConfig.config,
                    ) ?? ChartKind.VERTICAL_BAR,
                updatedAt: chart.updatedAt,
                updatedByUser: chart.updatedByUser,
            },
        }),
        [chart, composerChartUuid, projectUuid, user.data?.organizationUuid],
    );

    const chartView = isDrawn ? (
        <Sentry.ErrorBoundary
            beforeCapture={(scope) => scope.setTags(COMPOSER_CHART_SENTRY_TAGS)}
            fallback={({ error }) => (
                <ErrorState
                    error={toErrorDetail(
                        error instanceof Error ? error.message : String(error),
                    )}
                />
            )}
        >
            <ComposerChartVisualization
                key={chart.versionUuid}
                projectUuid={projectUuid}
                composerChartUuid={composerChartUuid}
                dashboardUuid={null}
                tileUuid={null}
                isDashboard={false}
                isTitleHidden
                minimal={false}
                draw={draw}
                results={results}
                rows={rows}
                onScreenshotReady={noop}
                onScreenshotError={noop}
                setEchartsRef={setEchartRef}
            />
        </Sentry.ErrorBoundary>
    ) : null;

    return (
        <Page
            title={chart.name}
            noContentPadding
            withFullHeight
            header={
                <PageHeader variant="dashboard">
                    <HeaderMain miw={0} mr="sm">
                        <HeaderTitle gap="xs" wrap="nowrap">
                            <TitleBreadCrumbs
                                size="sm"
                                projectUuid={projectUuid}
                                spaceUuid={chart.space.uuid}
                                spaceName={chart.space.name}
                            />
                            <HeaderHeading order={6} lineClamp={1}>
                                {chart.name}
                            </HeaderHeading>
                            <HeaderInfoPopover
                                label="Chart information"
                                info={{
                                    resourceUuid: composerChartUuid,
                                    projectUuid,
                                    description: chart.description ?? undefined,
                                    updatedAt: chart.updatedAt,
                                    updatedBy: editorName(chart.updatedByUser),
                                }}
                            />
                        </HeaderTitle>
                    </HeaderMain>
                    <HeaderActions gap="sm" wrap="nowrap">
                        {/* The agent only takes a composer chart with the flag on */}
                        {composerChartsEnabled && (
                            <AskAiAgentButton
                                projectUuid={projectUuid}
                                composerChartUuid={composerChartUuid}
                                clickedFrom="composer_chart_header"
                                variant="default"
                                size="md"
                            />
                        )}
                        <Tooltip label="Refresh" position="bottom">
                            <ActionIcon
                                variant="default"
                                size="md"
                                aria-label="Refresh"
                                loading={runQuery.isFetching}
                                onClick={refresh}
                            >
                                <MantineIcon icon={IconRefresh} />
                            </ActionIcon>
                        </Tooltip>
                        {canWrite && (
                            <Menu position="bottom-end" withArrow>
                                <Menu.Target>
                                    <Tooltip
                                        label="Chart actions"
                                        position="bottom"
                                    >
                                        <ActionIcon
                                            variant="default"
                                            size="md"
                                            aria-label="Chart actions"
                                        >
                                            <MantineIcon icon={IconDots} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconEdit} />
                                        }
                                        onClick={openRename}
                                    >
                                        Rename
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconFolderSymlink}
                                            />
                                        }
                                        onClick={openMove}
                                    >
                                        Move
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item
                                        color="red"
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                        onClick={openDelete}
                                    >
                                        Delete
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </HeaderActions>
                </PageHeader>
            }
        >
            <Stack className={explorerClasses.stack}>
                {(parametersQuery.isError || hasParameters) && (
                    <CollapsableCard
                        title="Parameters"
                        isOpen={isParametersOpen}
                        onToggle={setIsParametersOpen}
                    >
                        <Box m="md" data-testid="composer-chart-parameters">
                            {parametersQuery.isError ? (
                                <InlineErrorState
                                    message="Parameters could not be loaded"
                                    onRetry={() => parametersQuery.refetch()}
                                />
                            ) : (
                                <ParameterSelection
                                    parameters={
                                        parametersQuery.data
                                            ?.parameterDefinitions
                                    }
                                    parameterValues={parameterValues}
                                    onParameterChange={handleParameterChange}
                                    // Clear all removes picks; with none, it would change nothing
                                    showClearAll={Object.keys(picks).length > 0}
                                    onClearAll={handleClearParameters}
                                    cols={2}
                                    projectUuid={projectUuid}
                                    // Controls wait for the first run, which says the values in use
                                    isLoading={!run && runQuery.isLoading}
                                />
                            )}
                        </Box>
                    </CollapsableCard>
                )}
                <CollapsableCard
                    title="Chart"
                    isVisualizationCard
                    isOpen={isChartOpen}
                    onToggle={setIsChartOpen}
                    titleElement={
                        <SegmentedControl
                            size="xs"
                            value={view}
                            onChange={(value) => {
                                setView(value as View);
                                setIsChartOpen(true);
                            }}
                            data={[
                                {
                                    value: View.CHART,
                                    label: (
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon
                                                icon={IconChartHistogram}
                                            />
                                            Chart
                                        </Group>
                                    ),
                                },
                                {
                                    value: View.LINEAGE,
                                    label: (
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon
                                                icon={IconHierarchy2}
                                            />
                                            Lineage
                                        </Group>
                                    ),
                                },
                            ]}
                        />
                    }
                    rightHeaderElement={
                        canExportData && (
                            <Menu position="bottom-end" withArrow>
                                <Menu.Target>
                                    <Tooltip label="Export">
                                        <ActionIcon
                                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                                            aria-label="Export"
                                        >
                                            <MantineIcon icon={IconDownload} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconTableExport}
                                            />
                                        }
                                        disabled={!exportQueryUuid}
                                        onClick={openExport}
                                    >
                                        Download data
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconPhoto} />
                                        }
                                        disabled={!canExportImage}
                                        onClick={openImageExport}
                                    >
                                        Export image
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        )
                    }
                >
                    {view === View.CHART &&
                        (errorMessage !== null ? (
                            <ErrorState
                                error={runError ?? toErrorDetail(errorMessage)}
                            />
                        ) : isDrawn ? (
                            <Box className={styles.chart}>{chartView}</Box>
                        ) : (
                            <EmptyStateLoader title="Loading chart" />
                        ))}
                    {view === View.LINEAGE && (
                        <ComposerRunParametersContext.Provider
                            value={run?.usedParameterValuesByNodeId ?? {}}
                        >
                            <ComposerTileLineage
                                projectUuid={projectUuid}
                                pipeline={chart.pipeline}
                                run={run}
                                runError={runError?.message ?? null}
                                // The Chart tab draws the chart; Lineage shows only the pipeline
                                chart={null}
                            />
                        </ComposerRunParametersContext.Provider>
                    )}
                </CollapsableCard>
            </Stack>
            {exportQueryUuid && run && (
                <ExportDataModal
                    isOpen={exportOpened}
                    onClose={closeExport}
                    projectUuid={projectUuid}
                    totalResults={results.totalResults}
                    getDownloadQueryUuid={async () => exportQueryUuid}
                    customLabels={getComposerChartExportLabels(run.fields)}
                    chartName={chart.name}
                    hideLimitSelection
                    cellLimitedScopes={NO_CELL_LIMITED_SCOPES}
                />
            )}
            {renameOpened && (
                <ComposerChartUpdateModal
                    opened
                    projectUuid={projectUuid}
                    composerChartUuid={composerChartUuid}
                    name={chart.name}
                    description={chart.description}
                    onClose={closeRename}
                    onConfirm={closeRename}
                />
            )}
            {moveOpened && (
                <TransferItemsModal
                    projectUuid={projectUuid}
                    opened
                    onClose={closeMove}
                    items={[moveItem]}
                    isLoading={isMoving}
                    onConfirm={async (spaceUuid) => {
                        await contentAction({
                            action: {
                                type: 'move',
                                targetSpaceUuid: spaceUuid,
                            },
                            item: {
                                uuid: composerChartUuid,
                                contentType: ContentType.COMPOSER_CHART,
                            },
                        });
                        closeMove();
                    }}
                />
            )}
            {deleteOpened && (
                <ComposerChartDeleteModal
                    opened
                    projectUuid={projectUuid}
                    composerChartUuid={composerChartUuid}
                    name={chart.name}
                    onClose={closeDelete}
                    onConfirm={() =>
                        navigate(
                            `/projects/${projectUuid}/spaces/${chart.space.uuid}`,
                        )
                    }
                />
            )}
            {canExportImage && (
                <ExportImageModal
                    echartRef={echartRef}
                    chartName={chart.name}
                    isOpen={imageExportOpened}
                    onClose={closeImageExport}
                />
            )}
        </Page>
    );
};
