import { ProjectType, type DashboardBasicDetails } from '@lightdash/common';
import {
    Button,
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
import { IconArrowRight, IconExternalLink } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
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
                <Text fz="sm" c="dimmed">
                    {metric.title}
                </Text>
                <MantineIcon icon={IconArrowRight} color="dimmed" />
            </Group>
            {query.isLoading ? (
                <Skeleton h={38} my="xs" />
            ) : (
                <Text className={classes.metricValue}>
                    {value === undefined || value === null || query.isError
                        ? '—'
                        : formatAnalyticsNumber(Number(value))}
                </Text>
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
}: {
    projectUuid: string;
    projectUrlIdentifier: string;
    dashboards: DashboardBasicDetails[];
}) => {
    const [days, setDays] = useState('30');
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('overview');
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
        <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
                <Group gap="sm">
                    <Select
                        aria-label="Project"
                        placeholder="All projects"
                        clearable
                        searchable
                        data={projectOptions}
                        value={selectedProject}
                        onChange={setSelectedProject}
                        disabled={projects.isLoading || projects.isError}
                    />
                    <SegmentedControl
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
                    <Text fz="xs" c="dimmed" tabIndex={0}>
                        {dateLabel}
                    </Text>
                </Tooltip>
            </Group>
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
                <ScrollArea type="auto" offsetScrollbars>
                    <Tabs.List className={classes.tabs}>
                        {analyticsTabs.map(({ id, label }) => (
                            <Tabs.Tab value={id} key={id}>
                                {label}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                </ScrollArea>
                <Group justify="space-between" my="sm">
                    <Text c="dimmed" fz="xs">
                        Recorded activity in the selected period. Capture
                        coverage may vary.
                    </Text>
                    {dashboard && (
                        <Button
                            component={Link}
                            to={`/projects/${projectUrlIdentifier}/dashboards/${dashboard.slug}/view`}
                            target="_blank"
                            rel="noreferrer"
                            variant="subtle"
                            size="xs"
                            rightSection={
                                <MantineIcon icon={IconExternalLink} />
                            }
                        >
                            Open full dashboard
                        </Button>
                    )}
                </Group>
                <Tabs.Panel value={activeTab}>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
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
