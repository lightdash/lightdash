import {
    ProjectType,
    type DashboardBasicDetails,
    type RawResultRow,
} from '@lightdash/common';
import {
    Button,
    ActionIcon,
    Box,
    Center,
    Loader,
    Badge,
    Group,
    ScrollArea,
    SegmentedControl,
    Select,
    SimpleGrid,
    Skeleton,
    Stack,
    Tabs,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowRight,
    IconChevronLeft,
    IconChevronRight,
    IconExternalLink,
    IconHome,
} from '@tabler/icons-react';
import {
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import { useProjects } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';
import { PolymorphicPaperButton } from '../../common/PolymorphicPaperButton';
import {
    AnalyticsAdoptionLink,
    AnalyticsAdoptionPreview,
} from './AnalyticsAdoptionPreview';
import AnalyticsDashboardEmbed from './AnalyticsDashboardEmbed';
import classes from './AnalyticsOverview.module.css';
import AnalyticsOverviewChart from './AnalyticsOverviewChart';
import {
    analyticsDateRange,
    analyticsDateRangeDays,
    analyticsFieldId,
    analyticsHeadlineMetrics,
    analyticsTabs,
    formatAnalyticsNumber,
    type AnalyticsFilters,
} from './analyticsOverviewConfig';
import AnalyticsTabSummary from './AnalyticsTabSummary';
import { useAnalyticsAdoptionApp } from './useAnalyticsAdoptionApp';
import {
    useAnalyticsOverviewQueries,
    type AnalyticsOverviewQueryResult,
} from './useAnalyticsOverviewQuery';

type HeadlineMetricConfig = (typeof analyticsHeadlineMetrics)[number];

const getHeadlineValue = (
    metric: HeadlineMetricConfig,
    rows: RawResultRow[] | undefined,
) => {
    const field = analyticsFieldId(metric.query, metric.metric);
    if (metric.sumDailyCounts)
        return rows?.reduce((total, row) => total + Number(row[field] ?? 0), 0);
    return rows?.[0]?.[field];
};

const HeadlineMetric = ({
    metric,
    query,
    previousQuery,
    previousFilters,
    onSelect,
    selected,
}: {
    metric: HeadlineMetricConfig;
    query: AnalyticsOverviewQueryResult;
    previousQuery: AnalyticsOverviewQueryResult;
    previousFilters: AnalyticsFilters;
    onSelect: () => void;
    selected: boolean;
}) => {
    const value = getHeadlineValue(metric, query.data);
    const previousValue = getHeadlineValue(metric, previousQuery.data);
    const canCompare =
        !query.isError &&
        !previousQuery.isError &&
        value !== null &&
        value !== undefined &&
        previousValue !== null &&
        previousValue !== undefined;
    const change =
        canCompare && Number(previousValue) !== 0
            ? ((Number(value) - Number(previousValue)) /
                  Number(previousValue)) *
              100
            : 0;
    const isNew =
        canCompare && Number(previousValue) === 0 && Number(value) > 0;
    const previousLastDay = new Date(
        Date.parse(previousFilters.end) - 86_400_000,
    )
        .toISOString()
        .slice(0, 10);
    return (
        <PolymorphicPaperButton
            component="button"
            type="button"
            onClick={onSelect}
            className={classes.metric}
            data-selected={selected}
            aria-label={`View ${metric.title.toLowerCase()}`}
        >
            <Group justify="space-between" wrap="nowrap">
                <Text fz="sm" fw={500} c="dimmed">
                    {metric.title}
                </Text>
                <MantineIcon icon={IconArrowRight} color="dimmed" />
            </Group>
            {query.isLoading ? (
                <Skeleton h={38} my="xs" />
            ) : (
                <Group gap="xs" wrap="nowrap">
                    <Text className={classes.metricValue}>
                        {value === undefined || value === null || query.isError
                            ? '—'
                            : formatAnalyticsNumber(Number(value))}
                    </Text>
                    {canCompare && (
                        <Tooltip
                            label={`Compared with ${previousFilters.start} – ${previousLastDay} (UTC), based on recorded activity.`}
                        >
                            <Badge
                                color={
                                    isNew || change > 0
                                        ? 'green'
                                        : change < 0
                                          ? 'red'
                                          : 'gray'
                                }
                                variant="light"
                                size="sm"
                            >
                                {isNew
                                    ? 'New'
                                    : `${change > 0 ? '+' : ''}${Number(change.toFixed(1))}%`}
                            </Badge>
                        </Tooltip>
                    )}
                </Group>
            )}
            <Text fz="xs" c="dimmed">
                {query.isError ? 'Unable to load metric' : metric.description}
            </Text>
        </PolymorphicPaperButton>
    );
};

const AnalyticsOverview = ({
    projectUuid,
    projectUrlIdentifier,
    dashboards,
    areDashboardsLoading = false,
    heading,
    status,
    actions,
}: {
    projectUuid: string;
    projectUrlIdentifier: string;
    dashboards: DashboardBasicDetails[];
    areDashboardsLoading?: boolean;
    heading: ReactNode;
    status?: ReactNode;
    actions: ReactNode;
}) => {
    const [days, setDays] = useState('7');
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(() =>
        searchParams.get('tab') === 'adoption' ? 'adoption' : 'overview',
    );
    const tabsViewport = useRef<HTMLDivElement>(null);
    // The arrows only help when the tabs do not all fit
    const [doTabsOverflow, setDoTabsOverflow] = useState(false);
    useLayoutEffect(() => {
        const viewport = tabsViewport.current;
        if (!viewport) return undefined;
        const measure = () =>
            setDoTabsOverflow(viewport.scrollWidth - viewport.clientWidth > 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        if (viewport.firstElementChild)
            observer.observe(viewport.firstElementChild);
        return () => observer.disconnect();
    }, []);
    const projects = useProjects();
    const projectNames = useMemo(
        () =>
            Object.fromEntries(
                (projects.data ?? []).map((project) => [
                    project.projectUuid,
                    project.name,
                ]),
            ),
        [projects.data],
    );
    const projectOptions = (projects.data ?? [])
        .filter((project) => project.type !== ProjectType.PREVIEW)
        .map((project) => ({
            value: project.projectUuid,
            label: project.name,
        }));
    const inventoryExplore = useExploreByProjectUuid(
        selectedProject === null ? 'content_inventory' : undefined,
        projectUuid,
    );
    const filters: AnalyticsFilters = {
        ...analyticsDateRange(Number(days), new Date()),
        projectUuid: selectedProject,
        // Existing managed models gain the field on their next content sync.
        excludePreviewContent: inventoryExplore.isLoading
            ? null
            : Boolean(
                  inventoryExplore.data?.tables.content_health?.dimensions
                      .project_type,
              ),
    };
    const tab =
        analyticsTabs.find(({ id }) => id === activeTab) ?? analyticsTabs[0];
    // The Adoption app has its own controls and reads no dates or project
    const onAdoptionTab = tab.id === 'adoption';
    const [hasOpenedAdoption, setHasOpenedAdoption] = useState(onAdoptionTab);
    if (onAdoptionTab && !hasOpenedAdoption) setHasOpenedAdoption(true);
    // Where the app cannot be shown (data apps switched off, or no finished build) the tab is an ordinary one,
    // with its charts, filters and dashboard link
    const adoptionApp = useAnalyticsAdoptionApp(
        projectUuid,
        onAdoptionTab || hasOpenedAdoption,
    );
    const isAdoption = onAdoptionTab && adoptionApp.status !== 'unavailable';
    const dashboard = dashboards.find(
        ({ slug, verification }) => slug === tab.dashboardSlug && verification,
    );
    // A tab with a dashboard shows that dashboard. Its own charts are only for when there is none to show
    const isDashboard = !isAdoption && dashboard !== undefined;
    const isWaitingForDashboard =
        !isAdoption && areDashboardsLoading && tab.dashboardSlug !== null;
    // Once opened, a dashboard stays loaded behind the other tabs, like the Adoption app
    const [openedDashboards, setOpenedDashboards] = useState<string[]>([]);
    if (isDashboard && !openedDashboards.includes(dashboard.slug))
        setOpenedDashboards([...openedDashboards, dashboard.slug]);
    const showsOwnCharts =
        !isAdoption && !isDashboard && !isWaitingForDashboard;
    const charts = showsOwnCharts ? tab.charts : [];
    const summary = showsOwnCharts ? tab.summary : null;
    // The headline numbers summarise the whole instance, so they sit on the first tab only
    const showHeadlines = tab.id === 'overview';
    const headlineSpecs = showHeadlines
        ? analyticsHeadlineMetrics.map(({ query }) => query)
        : [];
    const currentQueries = useAnalyticsOverviewQueries(
        projectUuid,
        [
            ...headlineSpecs,
            ...charts.map(({ query }) => query),
            ...(summary ? [summary.query] : []),
        ],
        filters,
    );
    const previousFilters = {
        ...filters,
        ...analyticsDateRange(Number(days), new Date(filters.start)),
    };
    const previousQueries = useAnalyticsOverviewQueries(
        projectUuid,
        headlineSpecs,
        previousFilters,
        currentQueries.every((query) => !query.isLoading),
    );
    const lastDay = new Date(`${filters.end}T00:00:00Z`);
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    const dateLabel = `${new Date(`${filters.start}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })} – ${lastDay.toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })} (UTC)`;

    const dateNote = (
        <Tooltip label="Excludes today so every day in the range is complete.">
            <Text fz="xs" c="dimmed" ta="right" tabIndex={0}>
                {dateLabel}
            </Text>
        </Tooltip>
    );
    const projectControl = (
        <Tooltip
            label={selectedProject ? projectNames[selectedProject] : ''}
            disabled={!selectedProject}
            multiline
            maw={360}
            events={{
                hover: true,
                focus: true,
                touch: true,
            }}
        >
            <Select
                aria-label="Project"
                placeholder="All projects"
                clearable
                searchable
                data={projectOptions}
                value={selectedProject}
                onChange={setSelectedProject}
                disabled={projects.isLoading || projects.isError}
                className={classes.projectFilter}
                classNames={{
                    input: classes.projectInput,
                }}
            />
        </Tooltip>
    );
    const dateControl = (
        <SegmentedControl
            size="xs"
            withItemsBorders={false}
            classNames={{
                label: classes.dateOption,
                root: classes.dateControl,
                indicator: classes.dateIndicator,
            }}
            aria-label="Date range"
            value={days}
            onChange={setDays}
            data={analyticsDateRangeDays.map((range) => ({
                value: String(range),
                label: `Last ${range} days`,
            }))}
        />
    );
    return (
        <Stack gap="md" className={classes.overview}>
            <Group justify="space-between" align="center" gap="md">
                <Box className={classes.heading}>{heading}</Box>
                <Group gap="md" wrap="nowrap">
                    {status}
                    <Button
                        component={Link}
                        variant="default"
                        size="sm"
                        to={`/projects/${projectUrlIdentifier}/home`}
                        leftSection={<MantineIcon icon={IconHome} />}
                        className={classes.homepageLink}
                    >
                        Project homepage
                    </Button>
                </Group>
            </Group>
            {projects.isError && (
                <Text fz="xs" c="dimmed">
                    Project filters are unavailable. Showing all projects.
                </Text>
            )}
            <Tabs
                value={activeTab}
                onChange={(value) => setActiveTab(value ?? 'overview')}
                keepMounted={false}
            >
                <Group gap="md" wrap="nowrap" className={classes.tabBar}>
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        className={classes.tabNavigation}
                    >
                        {doTabsOverflow && (
                            <Tooltip label="Previous tabs">
                                <ActionIcon
                                    variant="default"
                                    size="xs"
                                    aria-label="Previous tabs"
                                    onClick={() =>
                                        tabsViewport.current?.scrollBy({
                                            left: -240,
                                            behavior: 'smooth',
                                        })
                                    }
                                >
                                    <MantineIcon icon={IconChevronLeft} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <ScrollArea
                            type="never"
                            viewportRef={tabsViewport}
                            className={classes.tabsViewport}
                            data-overflow={doTabsOverflow || undefined}
                        >
                            <Tabs.List className={classes.tabs}>
                                {analyticsTabs.map(
                                    ({ id, label, description }) => (
                                        <Tooltip
                                            key={id}
                                            label={description}
                                            position="bottom"
                                            multiline
                                            maw={320}
                                            openDelay={300}
                                            events={{
                                                hover: true,
                                                focus: true,
                                                touch: true,
                                            }}
                                        >
                                            <Tabs.Tab
                                                value={id}
                                                className={classes.tab}
                                            >
                                                {label}
                                            </Tabs.Tab>
                                        </Tooltip>
                                    ),
                                )}
                            </Tabs.List>
                        </ScrollArea>
                        {doTabsOverflow && (
                            <Tooltip label="More tabs">
                                <ActionIcon
                                    variant="default"
                                    size="xs"
                                    aria-label="More tabs"
                                    onClick={() =>
                                        tabsViewport.current?.scrollBy({
                                            left: 240,
                                            behavior: 'smooth',
                                        })
                                    }
                                >
                                    <MantineIcon icon={IconChevronRight} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                    <Group
                        gap="sm"
                        wrap="nowrap"
                        className={classes.tabActions}
                    >
                        {actions}
                        {isAdoption ? (
                            adoptionApp.status === 'ready' && (
                                <AnalyticsAdoptionLink
                                    projectUuid={projectUuid}
                                    appUuid={adoptionApp.appUuid}
                                />
                            )
                        ) : (
                            <Tooltip
                                label={
                                    dashboard
                                        ? 'Open full dashboard'
                                        : 'No full dashboard for this tab'
                                }
                            >
                                <Box component="span" display="inline-flex">
                                    {dashboard ? (
                                        <ActionIcon
                                            component={Link}
                                            to={`/projects/${projectUrlIdentifier}/dashboards/${dashboard.slug}/view`}
                                            target="_blank"
                                            rel="noreferrer"
                                            variant="default"
                                            size="sm"
                                            aria-label="Open full dashboard"
                                        >
                                            <MantineIcon
                                                icon={IconExternalLink}
                                            />
                                        </ActionIcon>
                                    ) : (
                                        <ActionIcon
                                            variant="default"
                                            size="sm"
                                            aria-label="Open full dashboard"
                                            disabled
                                        >
                                            <MantineIcon
                                                icon={IconExternalLink}
                                            />
                                        </ActionIcon>
                                    )}
                                </Box>
                            </Tooltip>
                        )}
                    </Group>
                </Group>
                {/* Once opened, the Adoption app stays loaded behind the other tabs, so coming back to it is instant */}
                {hasOpenedAdoption && adoptionApp.status === 'ready' && (
                    // Hidden by clipping, not by removing it from the layout: the app keeps its size behind the
                    // other tabs, so nothing in it is measured or drawn again on the way back
                    <Box
                        pt={isAdoption ? 'sm' : 0}
                        className={
                            isAdoption ? undefined : classes.adoptionHidden
                        }
                        aria-hidden={!isAdoption || undefined}
                    >
                        <AnalyticsAdoptionPreview
                            projectUuid={projectUuid}
                            app={adoptionApp}
                            active={isAdoption}
                        />
                    </Box>
                )}
                {openedDashboards.map((slug) => {
                    const opened = dashboards.find(
                        (candidate) => candidate.slug === slug,
                    );
                    if (!opened) return null;
                    const isShown = isDashboard && dashboard.slug === slug;
                    return (
                        <Box
                            key={slug}
                            pt={isShown ? 'sm' : 0}
                            className={
                                isShown ? undefined : classes.adoptionHidden
                            }
                            aria-hidden={!isShown || undefined}
                        >
                            <AnalyticsDashboardEmbed
                                projectUuid={projectUuid}
                                projectUrlIdentifier={projectUrlIdentifier}
                                slug={slug}
                                name={opened.name}
                                range={{
                                    start: filters.start,
                                    lastDay: lastDay.toISOString().slice(0, 10),
                                }}
                                chosenProject={selectedProject}
                                controls={{
                                    dateNote,
                                    date: dateControl,
                                    project: projectControl,
                                }}
                            />
                        </Box>
                    );
                })}
                <Tabs.Panel
                    value={activeTab}
                    pt={isAdoption || isDashboard ? 0 : 'lg'}
                >
                    {isAdoption ? (
                        adoptionApp.status === 'loading' && (
                            <Center
                                h={480}
                                role="status"
                                aria-label="Loading Adoption app"
                            >
                                <Loader size="sm" />
                            </Center>
                        )
                    ) : isDashboard ? null : isWaitingForDashboard ? (
                        <Center
                            h={480}
                            role="status"
                            aria-label="Loading dashboard"
                        >
                            <Loader size="sm" />
                        </Center>
                    ) : (
                        <Stack gap="md">
                            <Group gap="md" justify="flex-end" align="center">
                                {dateNote}
                                <Group
                                    gap="md"
                                    className={classes.filterControls}
                                >
                                    {projectControl}
                                    {dateControl}
                                </Group>
                            </Group>
                            {showHeadlines && (
                                <SimpleGrid
                                    cols={{ base: 1, sm: 2, xl: 4 }}
                                    spacing="md"
                                >
                                    {analyticsHeadlineMetrics.map(
                                        (metric, index) => (
                                            <HeadlineMetric
                                                key={metric.title}
                                                metric={metric}
                                                query={currentQueries[index]}
                                                previousQuery={
                                                    previousQueries[index]
                                                }
                                                previousFilters={
                                                    previousFilters
                                                }
                                                selected={
                                                    metric.tab === activeTab
                                                }
                                                onSelect={() =>
                                                    setActiveTab(metric.tab)
                                                }
                                            />
                                        ),
                                    )}
                                </SimpleGrid>
                            )}
                            {summary && (
                                <AnalyticsTabSummary
                                    key={tab.id}
                                    summary={summary}
                                    result={
                                        currentQueries[
                                            headlineSpecs.length + charts.length
                                        ]
                                    }
                                />
                            )}
                            <SimpleGrid
                                cols={{ base: 1, md: 2 }}
                                spacing="md"
                                className={classes.charts}
                                data-overview={activeTab === 'overview'}
                            >
                                {charts.map((chart, index) => (
                                    <AnalyticsOverviewChart
                                        key={`${tab.id}-${chart.title}`}
                                        chart={chart}
                                        result={
                                            currentQueries[
                                                headlineSpecs.length + index
                                            ]
                                        }
                                        projectNames={projectNames}
                                    />
                                ))}
                            </SimpleGrid>
                        </Stack>
                    )}
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default AnalyticsOverview;
