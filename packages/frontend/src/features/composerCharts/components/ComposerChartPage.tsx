import { subject } from '@casl/ability';
import {
    getComposerChartExportLabels,
    type ApiErrorDetail,
    type ComposerChartWithDetails,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Menu,
    Paper,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import * as Sentry from '@sentry/react';
import {
    IconChartHistogram,
    IconDots,
    IconHierarchy2,
    IconPhoto,
    IconRefresh,
    IconTableExport,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC, type RefObject } from 'react';
import { CHART_TYPES_WITHOUT_IMAGE_EXPORT } from '../../../components/common/ChartDownload/chartDownloadUtils';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import ErrorState from '../../../components/common/ErrorState';
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
import ExportDataModal from '../../../components/DashboardTiles/ExportDataModal';
import ExportImageModal from '../../../components/DashboardTiles/ExportImageModal';
import { type EChartsReact } from '../../../components/EChartsReactWrapper';
import { TitleBreadCrumbs } from '../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { NO_CELL_LIMITED_SCOPES } from '../../../components/ExportResults/exportCellEstimate';
import { useRefreshComposerChartOnAgentEdit } from '../../../ee/features/aiCopilot/hooks/useRefreshComposerChartOnAgentEdit';
import useApp from '../../../providers/App/useApp';
import { Parameters } from '../../parameters';
import {
    COMPOSER_CHART_SENTRY_TAGS,
    useComposerChartDraw,
} from '../hooks/useComposerChartDraw';
import {
    useComposerChartPageRun,
    useComposerChartParameters,
} from '../hooks/useComposerChartPage';
import { getComposerChartParameterValues } from '../utils/composerChartParameterValues';
import styles from './ComposerChartPage.module.css';
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
    const [view, setView] = useState<View>(View.CHART);
    const [picks, setPicks] = useState<ParametersValuesMap>({});
    const { runQuery, refresh } = useComposerChartPageRun({
        projectUuid,
        composerChartUuid,
        parameters: picks,
    });
    const parametersQuery = useComposerChartParameters(
        projectUuid,
        composerChartUuid,
    );
    const run = runQuery.data ?? null;
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

    const parameterValues = useMemo(
        () =>
            getComposerChartParameterValues({
                nodes: chart.pipeline.nodes,
                usedParameterValuesByNodeId:
                    run?.usedParameterValuesByNodeId ?? null,
                picks,
            }),
        [chart.pipeline.nodes, run, picks],
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
        view === View.CHART &&
        isDrawn &&
        !CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(draw.chartConfig.type);
    const exportQueryUuid = isDrawn ? displayedQueryUuid : null;
    const [echartRef, setEchartRef] = useState<
        RefObject<EChartsReact | null> | undefined
    >();
    const [exportOpened, { open: openExport, close: closeExport }] =
        useDisclosure(false);
    const [
        imageExportOpened,
        { open: openImageExport, close: closeImageExport },
    ] = useDisclosure(false);

    const renderChart = (minimal: boolean) =>
        isDrawn ? (
            <Sentry.ErrorBoundary
                beforeCapture={(scope) =>
                    scope.setTags(COMPOSER_CHART_SENTRY_TAGS)
                }
                fallback={({ error }) => (
                    <ErrorState
                        error={toErrorDetail(
                            error instanceof Error
                                ? error.message
                                : String(error),
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
                    minimal={minimal}
                    draw={draw}
                    results={results}
                    rows={rows}
                    onScreenshotReady={noop}
                    onScreenshotError={noop}
                    setEchartsRef={minimal ? undefined : setEchartRef}
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
                        {canExportData && (
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
                        )}
                    </HeaderActions>
                </PageHeader>
            }
        >
            <Stack p="lg" flex={1} miw={0} className={styles.root}>
                <Paper className={styles.pane}>
                    <Box className={styles.paneHeader}>
                        <SegmentedControl
                            size="sm"
                            value={view}
                            onChange={(value) => setView(value as View)}
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
                        <Group gap="xs" data-testid="composer-chart-parameters">
                            <Parameters
                                isEditMode={false}
                                parameters={
                                    parametersQuery.data?.parameterDefinitions
                                }
                                parameterValues={parameterValues}
                                onParameterChange={handleParameterChange}
                                onClearAll={handleClearParameters}
                                isLoading={parametersQuery.isInitialLoading}
                                isError={parametersQuery.isError}
                            />
                        </Group>
                    </Box>
                    <Box
                        className={styles.paneBody}
                        data-padded={view === View.CHART}
                    >
                        {view === View.CHART &&
                            (errorMessage !== null ? (
                                <ErrorState
                                    error={
                                        runError ?? toErrorDetail(errorMessage)
                                    }
                                />
                            ) : isDrawn ? (
                                <Box className={styles.chart}>
                                    {renderChart(false)}
                                </Box>
                            ) : (
                                <EmptyStateLoader title="Loading chart" />
                            ))}
                        {view === View.LINEAGE && (
                            <ComposerTileLineage
                                projectUuid={projectUuid}
                                pipeline={chart.pipeline}
                                run={run}
                                runError={runError?.message ?? null}
                                chart={renderChart(true)}
                            />
                        )}
                    </Box>
                </Paper>
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
