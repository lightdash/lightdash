import {
    type ActivityViews,
    type ChartActivityViews,
    type DashboardActivityViews,
    type UserActivity as UserActivityResponse,
    type UserWithCount,
} from '@lightdash/common';
import {
    Box,
    Group,
    Stack,
    Text,
    Title,
    Button,
    Anchor,
    Card,
    Table,
    Tooltip,
} from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import EChartsReact from '../components/EChartsReactWrapper';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    useDownloadUserActivityCsv,
    useUserActivity,
} from '../hooks/analytics/useUserActivity';
import useHealth from '../hooks/health/useHealth';
import { useProject } from '../hooks/useProject';
import { useProjectUuid } from '../hooks/useProjectUuid';
import useApp from '../providers/App/useApp';
import classes from './UserActivity.module.css';

const VisualizationCard = ({
    grid,
    description,
    children,
}: {
    grid: string;
    description?: string;
    children: React.ReactNode;
}) => {
    return (
        <Card
            className={classes.visualizationCard}
            style={{ '--tile-area': grid }}
        >
            <Text style={{ float: 'left' }} fw={600} mb={10}>
                {description}
            </Text>
            {children}
        </Card>
    );
};

const BigNumberVis: FC<{ value: number | string; label: string }> = ({
    value,
    label,
}) => {
    return (
        <Stack h="100%" justify="center" gap={0}>
            <Title order={1} size={56} fw={500}>
                {value}
            </Title>
            <Title order={4} fw={500} c="gray">
                {label}
            </Title>
        </Stack>
    );
};

const getDashboardLink = (projectUuid: string, dashboardSlug: string) =>
    `/projects/${projectUuid}/dashboards/${dashboardSlug}`;

const getChartLink = (projectUuid: string, chartSlug: string) =>
    `/projects/${projectUuid}/saved/${chartSlug}`;

const showTableViews = <T extends ActivityViews>({
    key,
    views,
    getLink,
}: {
    key: string;
    views: T[];
    getLink: (view: T) => string;
}) => {
    return (
        <Table.Tbody>
            {views.map((view) => {
                const to = getLink(view);
                return (
                    <Table.Tr key={`${key}-${view.uuid}`}>
                        <Table.Td>
                            <Anchor inherit component={Link} to={to}>
                                {view.name}
                            </Anchor>
                        </Table.Td>
                        <Table.Td>{view.count}</Table.Td>
                    </Table.Tr>
                );
            })}
        </Table.Tbody>
    );
};

const showTableBodyWithUsers = (key: string, userList: UserWithCount[]) => {
    return (
        <Table.Tbody>
            {userList.map((user) => {
                return (
                    <Table.Tr key={`${key}-${user.userUuid}`}>
                        <Table.Td>{user.firstName} </Table.Td>
                        <Table.Td>{user.lastName}</Table.Td>
                        <Table.Td>{user.count}</Table.Td>
                    </Table.Tr>
                );
            })}
        </Table.Tbody>
    );
};

const chartWeeklyQueryingUsers = (
    data: UserActivityResponse['chartWeeklyQueryingUsers'],
    t: TFunction,
) => ({
    grid: {
        height: '250px',
        top: '90',
    },
    xAxis: {
        type: 'time',
    },
    yAxis: [
        {
            type: 'value',
            name: t('userActivity.charts.numUsers'),
            nameLocation: 'center',
            nameGap: '40',
        },
        {
            type: 'value',
            name: t('userActivity.charts.percentUsers'),
            nameLocation: 'center',
            nameGap: '40',
            nameRotate: -90,
        },
    ],
    legend: { top: '40' },
    series: [
        {
            name: t('userActivity.charts.weeklyQueryingUsers'),
            data: data.map((queries: any) => [
                queries.date,
                queries.num_7d_active_users,
            ]),
            type: 'bar',
            color: '#d7c1fa',
        },
        {
            name: t('userActivity.charts.percentWeeklyQueryingUsers'),
            yAxisIndex: 1,
            data: data.map((queries: any) => [
                queries.date,
                queries.percent_7d_active_users,
            ]),
            type: 'line',
            symbol: 'none',
            smooth: true,
            color: '#7262ff',
        },
    ],
});

const chartWeeklyAverageQueries = (
    data: UserActivityResponse['chartWeeklyAverageQueries'],
    t: TFunction,
) => ({
    grid: {
        height: '280px',
    },
    xAxis: {
        type: 'time',
    },
    yAxis: {
        type: 'value',
        name: t('userActivity.charts.weeklyAverageQueries'),
        nameLocation: 'center',
        nameGap: '25',
    },
    series: [
        {
            data: data.map((queries) => [
                queries.date,
                queries.average_number_of_weekly_queries_per_user,
            ]),
            type: 'line',
            symbol: 'none',
            smooth: true,
            color: '#16df95',
        },
    ],
});

const UserActivity: FC = () => {
    const { t } = useTranslation('pages');
    const projectUuid = useProjectUuid();
    const { data: project } = useProject(projectUuid);
    const { user: sessionUser } = useApp();
    const { data: health } = useHealth();
    const { mutateAsync: downloadCsv, isLoading: isDownloadingCsv } =
        useDownloadUserActivityCsv();

    const { data, isInitialLoading } = useUserActivity(projectUuid);
    if (sessionUser.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (projectUuid === undefined || isInitialLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title={t('common.loading')} loading />
            </div>
        );
    }

    return (
        <Page
            title={t('userActivity.title', { name: project?.name })}
            withPaddedContent
        >
            <Group mt={10} mb={30} justify="space-between">
                <PageBreadcrumbs
                    items={[
                        {
                            title: t('userActivity.usageAnalytics'),
                            to: `/generalSettings/projectManagement/${projectUuid}/usageAnalytics`,
                        },
                        {
                            title: (
                                <Group
                                    style={{
                                        display: 'flex',
                                        gap: 6,
                                        alignItems: 'center',
                                    }}
                                >
                                    <MantineIcon icon={IconUsers} size={20} />{' '}
                                    {t('userActivity.title', {
                                        name: project?.name,
                                    })}
                                </Group>
                            ),
                            active: true,
                        },
                    ]}
                />
                <Tooltip label={t('userActivity.exportTooltip')}>
                    <Button
                        variant="outline"
                        disabled={isDownloadingCsv}
                        onClick={() => {
                            if (projectUuid)
                                downloadCsv(projectUuid)
                                    .then((url) => {
                                        if (url) {
                                            // If the file takes a while to download,
                                            // The browser might block the download when using window.open
                                            // For that we need to create a link and click it
                                            const link =
                                                document.createElement('a');
                                            link.href = url;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                        }
                                    })
                                    .catch(console.error);
                        }}
                    >
                        {isDownloadingCsv
                            ? t('userActivity.exporting')
                            : t('userActivity.exportCsv')}
                    </Button>
                </Tooltip>
            </Group>
            <Box className={classes.grid}>
                <VisualizationCard grid="total-users">
                    <BigNumberVis
                        value={data.numberUsers}
                        label={t('userActivity.totalUsers')}
                    />
                </VisualizationCard>
                <VisualizationCard grid="viewers">
                    <BigNumberVis
                        value={data.numberViewers}
                        label={t('userActivity.numViewers')}
                    />
                </VisualizationCard>
                <VisualizationCard grid="interactive-viewers">
                    <BigNumberVis
                        value={data.numberInteractiveViewers}
                        label={t('userActivity.numInteractiveViewers')}
                    />
                </VisualizationCard>
                <VisualizationCard grid="editors">
                    <BigNumberVis
                        value={data.numberEditors}
                        label={t('userActivity.numEditors')}
                    />
                </VisualizationCard>

                <VisualizationCard grid="admins">
                    <BigNumberVis
                        value={data.numberAdmins}
                        label={t('userActivity.numAdmins')}
                    />
                </VisualizationCard>
                <VisualizationCard grid="weekly-active">
                    <BigNumberVis
                        value={`${data.numberWeeklyQueryingUsers}%`}
                        label={t('userActivity.weeklyActive')}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="chart-active-users"
                    description={t('userActivity.chartActiveUsers')}
                >
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyQueryingUsers(
                            data.chartWeeklyQueryingUsers,
                            t,
                        )}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="queries-per-user"
                    description={t('userActivity.queriesPerUser')}
                >
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyAverageQueries(
                            data.chartWeeklyAverageQueries,
                            t,
                        )}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="table-most-queries"
                    description={t('userActivity.mostQueries')}
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>
                                    {t('userActivity.columns.firstName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.lastName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.numQueries')}
                                </Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        {showTableBodyWithUsers(
                            'users-most-queries',
                            data.tableMostQueries,
                        )}
                    </Table>
                </VisualizationCard>
                <VisualizationCard
                    grid="table-most-charts"
                    description={t('userActivity.mostChartUpdates')}
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>
                                    {t('userActivity.columns.firstName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.lastName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.numChartUpdates')}
                                </Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        {showTableBodyWithUsers(
                            'users-created-most-charts',
                            data.tableMostCreatedCharts,
                        )}
                    </Table>
                </VisualizationCard>
                <VisualizationCard
                    grid="table-not-logged-in"
                    description={t('userActivity.notLoggedIn')}
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>
                                    {t('userActivity.columns.firstName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.lastName')}
                                </Table.Th>
                                <Table.Th>
                                    {t(
                                        'userActivity.columns.daysSinceLastQuery',
                                    )}
                                </Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        {showTableBodyWithUsers(
                            'users-not-logged-in',
                            data.tableNoQueries,
                        )}
                    </Table>
                </VisualizationCard>

                <VisualizationCard
                    grid="table-most-viewed"
                    description={t('userActivity.mostViewedDashboard')}
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>
                                    {t('userActivity.columns.firstName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.lastName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.dashboardName')}
                                </Table.Th>
                                <Table.Th>
                                    {t('userActivity.columns.numViews')}
                                </Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {data.userMostViewedDashboards.map((user) => {
                                return (
                                    <Table.Tr
                                        key={`user-most-viewed-${user.userUuid}`}
                                    >
                                        <Table.Td>{user.firstName} </Table.Td>
                                        <Table.Td>{user.lastName}</Table.Td>
                                        <Table.Td>
                                            <Anchor
                                                inherit
                                                component={Link}
                                                to={getDashboardLink(
                                                    projectUuid,
                                                    user.dashboardSlug,
                                                )}
                                            >
                                                {user.dashboardName}
                                            </Anchor>
                                        </Table.Td>

                                        <Table.Td>{user.count}</Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </VisualizationCard>
                {health?.hasExtendedUsageAnalytics ? (
                    <>
                        <VisualizationCard
                            grid="table-dashboard-views"
                            description={t('userActivity.dashboardViews')}
                        >
                            <Table withColumnBorders ta="left">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>
                                            {t(
                                                'userActivity.columns.dashboardName',
                                            )}
                                        </Table.Th>
                                        <Table.Th>
                                            {t('userActivity.columns.views')}
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                {showTableViews({
                                    key: 'dashboard-views',
                                    views: data.dashboardViews,
                                    getLink: (view: DashboardActivityViews) =>
                                        getDashboardLink(
                                            projectUuid,
                                            view.slug,
                                        ),
                                })}
                            </Table>
                        </VisualizationCard>
                        <VisualizationCard
                            grid="table-chart-views"
                            description={t('userActivity.chartViews')}
                        >
                            <Table withColumnBorders ta="left">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>
                                            {t(
                                                'userActivity.columns.chartName',
                                            )}
                                        </Table.Th>
                                        <Table.Th>
                                            {t('userActivity.columns.views')}
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                {showTableViews({
                                    key: 'chart-views',
                                    views: data.chartViews,
                                    getLink: (view: ChartActivityViews) =>
                                        getChartLink(projectUuid, view.slug),
                                })}
                            </Table>
                        </VisualizationCard>
                    </>
                ) : null}
            </Box>
        </Page>
    );
};

export default UserActivity;
