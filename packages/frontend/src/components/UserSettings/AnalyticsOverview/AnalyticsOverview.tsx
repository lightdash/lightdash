import { ProjectType, type DashboardBasicDetails } from '@lightdash/common';
import {
    Button,
    ActionIcon,
    Box,
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
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useProjects } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';
import { PolymorphicPaperButton } from '../../common/PolymorphicPaperButton';
import classes from './AnalyticsOverview.module.css';
import AnalyticsOverviewChart from './AnalyticsOverviewChart';
import {
    analyticsDateRange,
    analyticsFieldId,
    analyticsHeadlineMetrics,
    analyticsTabs,
    formatAnalyticsNumber,
    type AnalyticsFilters,
} from './analyticsOverviewConfig';
import { useAnalyticsOverviewQuery } from './useAnalyticsOverviewQuery';

const HeadlineMetric = ({
    projectUuid,
    metric,
    filters,
    onSelect,
    selected,
}: {
    projectUuid: string;
    metric: (typeof analyticsHeadlineMetrics)[number];
    filters: AnalyticsFilters;
    onSelect: () => void;
    selected: boolean;
}) => {
    const query = useAnalyticsOverviewQuery(projectUuid, metric.query, filters);
    const value =
        query.data?.[0]?.[analyticsFieldId(metric.query, metric.metric)];
    const previousStart = new Date(
        2 * Date.parse(filters.start) - Date.parse(filters.end),
    )
        .toISOString()
        .slice(0, 10);
    const previousQuery = useAnalyticsOverviewQuery(projectUuid, metric.query, {
        ...filters,
        start: previousStart,
        end: filters.start,
    });
    const previousValue =
        previousQuery.data?.[0]?.[
            analyticsFieldId(metric.query, metric.metric)
        ];
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
    const previousLastDay = new Date(Date.parse(filters.start) - 86_400_000)
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
                <Group gap="sm">
                    <Text className={classes.metricValue}>
                        {value === undefined || value === null || query.isError
                            ? '—'
                            : formatAnalyticsNumber(Number(value))}
                    </Text>
                    {canCompare && (
                        <Tooltip
                            label={`Compared with ${previousStart} – ${previousLastDay} (UTC), based on recorded activity.`}
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
    heading,
    actions,
}: {
    projectUuid: string;
    projectUrlIdentifier: string;
    dashboards: DashboardBasicDetails[];
    heading: ReactNode;
    actions: ReactNode;
}) => {
    const [days, setDays] = useState('7');
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('overview');
    const tabsViewport = useRef<HTMLDivElement>(null);
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
        .filter(
            (project) =>
                project.projectUuid !== projectUuid &&
                project.type !== ProjectType.PREVIEW,
        )
        .map((project) => ({
            value: project.projectUuid,
            label: project.name,
        }));
    const filters: AnalyticsFilters = {
        ...analyticsDateRange(Number(days), new Date()),
        projectUuid: selectedProject,
    };
    const tab =
        analyticsTabs.find(({ id }) => id === activeTab) ?? analyticsTabs[0];
    const dashboard = dashboards.find(
        ({ slug, verification }) => slug === tab.dashboardSlug && verification,
    );
    const lastDay = new Date(`${filters.end}T00:00:00Z`);
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    const dateLabel = `${new Date(`${filters.start}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })} – ${lastDay.toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })} (UTC)`;

    return (
        <Stack gap="xl" className={classes.overview}>
            <Box className={classes.header}>
                <Box className={classes.heading}>{heading}</Box>
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
                <Stack gap="xs" className={classes.filters}>
                    <Group gap="md" className={classes.filterControls}>
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
                        />
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
                            data={['7', '30', '90'].map((value) => ({
                                value,
                                label: `Last ${value} days`,
                            }))}
                        />
                    </Group>
                    <Tooltip label="Excludes today so every day in the range is complete.">
                        <Text fz="xs" c="dimmed" ta="right" tabIndex={0}>
                            {dateLabel}
                        </Text>
                    </Tooltip>
                </Stack>
            </Box>
            {projects.isError && (
                <Text fz="xs" c="dimmed">
                    Project filters are unavailable. Showing all projects.
                </Text>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
                {analyticsHeadlineMetrics.map((metric) => (
                    <HeadlineMetric
                        key={metric.title}
                        projectUuid={projectUuid}
                        metric={metric}
                        filters={filters}
                        selected={metric.tab === activeTab}
                        onSelect={() => setActiveTab(metric.tab)}
                    />
                ))}
            </SimpleGrid>
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
                        <ScrollArea
                            type="never"
                            viewportRef={tabsViewport}
                            className={classes.tabsViewport}
                        >
                            <Tabs.List className={classes.tabs}>
                                {analyticsTabs.map(({ id, label }) => (
                                    <Tabs.Tab
                                        value={id}
                                        key={id}
                                        className={classes.tab}
                                    >
                                        {label}
                                    </Tabs.Tab>
                                ))}
                            </Tabs.List>
                        </ScrollArea>
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
                    </Group>
                    <Group
                        gap="sm"
                        wrap="nowrap"
                        className={classes.tabActions}
                    >
                        {actions}
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
                                        <MantineIcon icon={IconExternalLink} />
                                    </ActionIcon>
                                ) : (
                                    <ActionIcon
                                        variant="default"
                                        size="sm"
                                        aria-label="Open full dashboard"
                                        disabled
                                    >
                                        <MantineIcon icon={IconExternalLink} />
                                    </ActionIcon>
                                )}
                            </Box>
                        </Tooltip>
                    </Group>
                </Group>
                <Tabs.Panel value={activeTab} pt="lg">
                    <SimpleGrid
                        cols={{ base: 1, md: 2 }}
                        spacing="md"
                        className={classes.charts}
                        data-overview={activeTab === 'overview'}
                    >
                        {tab.charts.map((chart) => (
                            <AnalyticsOverviewChart
                                key={`${tab.id}-${chart.title}`}
                                projectUuid={projectUuid}
                                chart={chart}
                                filters={filters}
                                projectNames={projectNames}
                            />
                        ))}
                    </SimpleGrid>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default AnalyticsOverview;
