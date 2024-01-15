import {
    ActivityViews,
    UserActivity as UserActivityResponse,
    UserWithCount,
} from '@lightdash/common';
import { Box, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import EChartsReact from 'echarts-for-react';
import { FC } from 'react';
import { useParams } from 'react-router-dom';

import posthog from 'posthog-js';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useUserActivity } from '../hooks/analytics/useUserActivity';
import { useProject } from '../hooks/useProject';
import { useApp } from '../providers/AppProvider';

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
            sx={{
                verticalAlign: 'middle',
                textAlign: 'center',
                gridArea: grid,
                overflow: 'auto',
            }}
            withBorder
        >
            <Text sx={{ float: 'left' }} fw={600} mb={10}>
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
        <Stack h="100%" justify="center" spacing={0}>
            <Title order={1} size={56} fw={500}>
                {value}
            </Title>
            <Title order={4} fw={500} color="gray">
                {label}
            </Title>
        </Stack>
    );
};

const showTableViews = (key: string, views: ActivityViews[]) => {
    return (
        <tbody>
            {views.map((view) => {
                return (
                    <tr key={`${key}-${view.uuid}`}>
                        <td>{view.name}</td>
                        <td>{view.count}</td>
                    </tr>
                );
            })}
        </tbody>
    );
};

const showTableBodyWithUsers = (key: string, userList: UserWithCount[]) => {
    return (
        <tbody>
            {userList.map((user) => {
                return (
                    <tr key={`${key}-${user.userUuid}`}>
                        <td>{user.firstName} </td>
                        <td>{user.lastName}</td>
                        <td>{user.count}</td>
                    </tr>
                );
            })}
        </tbody>
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

    const { data, isInitialLoading } = useUserActivity(params.projectUuid);
    if (sessionUser.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (isInitialLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    return (
        <Page title={`User activity for ${project?.name}`} withFitContent>
            <Box mt={10} mb={30}>
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
            </Box>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: '300px 300px 300px 300px',
                    gridTemplateRows: '200px 200px 400px 400px 400px 400px',
                    gap: '10px 10px',
                    gridTemplateAreas: `
                     'total-users total-users weekly-active weekly-active'
                     'viewers interactive-viewers editors admins '
                     'chart-active-users chart-active-users queries-per-user queries-per-user'
                     'table-most-queries table-most-queries table-most-charts table-most-charts'
                     'table-not-logged-in table-not-logged-in . .'
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
                        <thead>
                            <tr>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of Queries</th>
                            </tr>
                        </thead>
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
                        <thead>
                            <tr>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of chart updates</th>
                            </tr>
                        </thead>
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
                        <thead>
                            <tr>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Days since last query</th>
                            </tr>
                        </thead>
                        {showTableBodyWithUsers(
                            'users-not-logged-in',
                            data.tableNoQueries,
                        )}
                    </Table>
                </VisualizationCard>

                {posthog.isFeatureEnabled('extended-usage-analytics') ? (
                    <>
                        <VisualizationCard
                            grid="table-dashboard-views"
                            description="Dashboard views (top 20)"
                        >
                            <Table withColumnBorders ta="left">
                                <thead>
                                    <tr>
                                        <th>Dashboard name</th>
                                        <th>Views</th>
                                    </tr>
                                </thead>
                                {showTableViews(
                                    'dashboard-views',
                                    data.dashboardViews,
                                )}
                            </Table>
                        </VisualizationCard>
                        <VisualizationCard
                            grid="table-chart-views"
                            description="Chart views (top 20)"
                        >
                            <Table withColumnBorders ta="left">
                                <thead>
                                    <tr>
                                        <th>Chart name</th>
                                        <th>Views</th>
                                    </tr>
                                </thead>
                                {showTableViews('chart-views', data.chartViews)}
                            </Table>
                        </VisualizationCard>
                    </>
                ) : null}
            </Box>
        </Page>
    );
};

export default UserActivity;
