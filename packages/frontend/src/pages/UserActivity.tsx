import {
    type ActivityViews,
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
} from '@mantine-8/core';
import { Tooltip } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
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
            style={{ gridArea: grid }}
            withBorder
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

const getDashboardLink = (projectUuid: string, dashboardUuid: string) =>
    `/projects/${projectUuid}/dashboards/${dashboardUuid}`;

const getChartLink = (projectUuid: string, chartUuid: string) =>
    `/projects/${projectUuid}/saved/${chartUuid}`;

const showTableViews = ({
    key,
    projectUuid,
    type,
    views,
}: {
    key: string;
    projectUuid: string;
    type: 'chart' | 'dashboard';
    views: ActivityViews[];
}) => {
    return (
        <Table.Tbody>
            {views.map((view) => {
                const to =
                    type === 'dashboard'
                        ? getDashboardLink(projectUuid, view.uuid)
                        : getChartLink(projectUuid, view.uuid);
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
            name: 'Num users',
            nameLocation: 'center',
            nameGap: '40',
        },
        {
            type: 'value',
            name: '% users',
            nameLocation: 'center',
            nameGap: '40',
            nameRotate: -90,
        },
    ],
    legend: { top: '40' },
    series: [
        {
            name: 'Number of weekly querying users',
            data: data.map((queries: any) => [
                queries.date,
                queries.num_7d_active_users,
            ]),
            type: 'bar',
            color: '#d7c1fa',
        },
        {
            name: '% of weekly querying users',
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
) => ({
    grid: {
        height: '280px',
    },
    xAxis: {
        type: 'time',
    },
    yAxis: {
        type: 'value',
        name: 'Weekly average number of\nqueries per user',
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
    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(params.projectUuid);
    const { user: sessionUser } = useApp();
    const { data: health } = useHealth();
    const { mutateAsync: downloadCsv, isLoading: isDownloadingCsv } =
        useDownloadUserActivityCsv();

    const { data, isInitialLoading } = useUserActivity(params.projectUuid);
    const projectUuid = params.projectUuid;
    if (sessionUser.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (projectUuid === undefined || isInitialLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    return (
        <Page title={`User activity for ${project?.name}`} withFitContent>
            <Group mt={10} mb={30} justify="space-between">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'Usage analytics',
                            to: `/generalSettings/projectManagement/${params.projectUuid}/usageAnalytics`,
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
                                    User activity for {project?.name}
                                </Group>
                            ),
                            active: true,
                        },
                    ]}
                />
                <Tooltip label="Export raw chart and dashboard user views in a CSV format">
                    <Button
                        variant="outline"
                        disabled={isDownloadingCsv}
                        onClick={() => {
                            if (params.projectUuid)
                                downloadCsv(params.projectUuid)
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
                        {isDownloadingCsv ? 'Exporting...' : 'Export CSV'}
                    </Button>
                </Tooltip>
            </Group>
            <Box
                style={{
                    display: 'grid',
                    gridTemplateColumns: '300px 300px 300px 300px',
                    gridTemplateRows: '200px 200px 400px 400px 400px 400px',
                    gap: '10px 10px',
                    gridTemplateAreas: `
                     'total-users total-users weekly-active weekly-active'
                     'viewers interactive-viewers editors admins '
                     'chart-active-users chart-active-users queries-per-user queries-per-user'
                     'table-most-queries table-most-queries table-most-charts table-most-charts'
                     'table-not-logged-in table-not-logged-in table-most-viewed table-most-viewed'
                     'table-dashboard-views table-dashboard-views table-chart-views table-chart-views'`,
                }}
            >
                <VisualizationCard grid="total-users">
                    <BigNumberVis
                        value={data.numberUsers}
                        label="Total users in project"
                    />
                </VisualizationCard>
                <VisualizationCard grid="viewers">
                    <BigNumberVis
                        value={data.numberViewers}
                        label="Number of viewers"
                    />
                </VisualizationCard>
                <VisualizationCard grid="interactive-viewers">
                    <BigNumberVis
                        value={data.numberInteractiveViewers}
                        label="
                        Number of interactive viewers
                    "
                    />
                </VisualizationCard>
                <VisualizationCard grid="editors">
                    <BigNumberVis
                        value={data.numberEditors}
                        label="Number of editors"
                    />
                </VisualizationCard>

                <VisualizationCard grid="admins">
                    <BigNumberVis
                        value={data.numberAdmins}
                        label="Number of admins"
                    />
                </VisualizationCard>
                <VisualizationCard grid="weekly-active">
                    <BigNumberVis
                        value={`${data.numberWeeklyQueryingUsers}%`}
                        label="Users that viewed a chart in the last 7 days"
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="chart-active-users"
                    description="
                        How many users are querying this project, weekly?"
                >
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyQueryingUsers(
                            data.chartWeeklyQueryingUsers,
                        )}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="queries-per-user"
                    description="
                        How many queries are users running each week, on
                        average?"
                >
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyAverageQueries(
                            data.chartWeeklyAverageQueries,
                        )}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="table-most-queries"
                    description="
                        Which users have run the most queries in the last 7
                        days?"
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>First Name</Table.Th>
                                <Table.Th>Last Name</Table.Th>
                                <Table.Th>Number of Queries</Table.Th>
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
                    description="
                        Which users have made the most updates to charts in the
                        last 7 days? (top 10)"
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>First Name</Table.Th>
                                <Table.Th>Last Name</Table.Th>
                                <Table.Th>Number of chart updates</Table.Th>
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
                    description="Which users have not run queries in the last 90 days?"
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>First Name</Table.Th>
                                <Table.Th>Last Name</Table.Th>
                                <Table.Th>Days since last query</Table.Th>
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
                    description="User's most viewed dashboard"
                >
                    <Table withColumnBorders ta="left">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>First Name</Table.Th>
                                <Table.Th>Last Name</Table.Th>
                                <Table.Th>Dashboard name</Table.Th>
                                <Table.Th>Number of views</Table.Th>
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
                                                    user.dashboardUuid,
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
                            description="Dashboard views (top 20)"
                        >
                            <Table withColumnBorders ta="left">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Dashboard name</Table.Th>
                                        <Table.Th>Views</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                {showTableViews({
                                    key: 'dashboard-views',
                                    projectUuid,
                                    type: 'dashboard',
                                    views: data.dashboardViews,
                                })}
                            </Table>
                        </VisualizationCard>
                        <VisualizationCard
                            grid="table-chart-views"
                            description="Chart views (top 20)"
                        >
                            <Table withColumnBorders ta="left">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Chart name</Table.Th>
                                        <Table.Th>Views</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                {showTableViews({
                                    key: 'chart-views',
                                    projectUuid,
                                    type: 'chart',
                                    views: data.chartViews,
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
