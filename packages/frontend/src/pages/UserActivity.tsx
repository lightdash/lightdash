import {
    ActivityViews,
    UserActivity as UserActivityResponse,
    UserWithCount,
} from '@lightdash/common';
import { Group, Table } from '@mantine/core';
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
import {
    ActivityCard,
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    ChartCard,
    Container,
    Description,
    UserAnalyticsPageHeader,
} from './UserActivity.styles';

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

    const { data, isLoading } = useUserActivity(params.projectUuid);
    if (sessionUser.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (isLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    return (
        <Page title={`User activity for ${project?.name}`} withFitContent>
            <UserAnalyticsPageHeader>
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
            </UserAnalyticsPageHeader>
            <Container>
                <ActivityCard grid="total-users">
                    <BigNumberContainer>
                        <BigNumber>{data.numberUsers}</BigNumber>
                        <BigNumberLabel>Total users in project</BigNumberLabel>
                    </BigNumberContainer>
                </ActivityCard>
                <ActivityCard grid="viewers">
                    <BigNumberContainer>
                        <BigNumber>{data.numberViewers}</BigNumber>
                        <BigNumberLabel>Number of viewers</BigNumberLabel>
                    </BigNumberContainer>
                </ActivityCard>
                <ActivityCard grid="interactive-viewers">
                    <BigNumberContainer>
                        <BigNumber>{data.numberInteractiveViewers}</BigNumber>
                        <BigNumberLabel>
                            Number of interactive viewers
                        </BigNumberLabel>
                    </BigNumberContainer>
                </ActivityCard>
                <ActivityCard grid="editors">
                    <BigNumberContainer>
                        <BigNumber>{data.numberEditors}</BigNumber>
                        <BigNumberLabel>Number of editors</BigNumberLabel>
                    </BigNumberContainer>
                </ActivityCard>

                <ActivityCard grid="admins">
                    <BigNumberContainer>
                        <BigNumber>{data.numberAdmins}</BigNumber>
                        <BigNumberLabel>Number of admins</BigNumberLabel>
                    </BigNumberContainer>
                </ActivityCard>
                <ActivityCard grid="weekly-active">
                    <BigNumberContainer>
                        <BigNumber>
                            {data.numberWeeklyQueryingUsers} %
                        </BigNumber>
                        <BigNumberLabel>
                            Users that viewed a chart in the last 7 days
                        </BigNumberLabel>
                    </BigNumberContainer>
                </ActivityCard>

                <ChartCard grid="chart-active-users">
                    <Description>
                        How many users are querying this project, weekly?
                    </Description>
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyQueryingUsers(
                            data.chartWeeklyQueryingUsers,
                        )}
                    />
                </ChartCard>

                <ChartCard grid="queries-per-user">
                    <Description>
                        How many queries are users running each week, on
                        average?
                    </Description>
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyAverageQueries(
                            data.chartWeeklyAverageQueries,
                        )}
                    />
                </ChartCard>

                <ActivityCard grid="table-most-queries">
                    <Description>
                        Which users have run the most queries in the last 7
                        days?
                    </Description>

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
                </ActivityCard>
                <ActivityCard grid="table-most-charts">
                    <Description>
                        Which users have made the most updates to charts in the
                        last 7 days? (top 10)
                    </Description>

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
                </ActivityCard>
                <ActivityCard grid="table-not-logged-in">
                    <Description>
                        Which users have not run queries in the last 90 days?
                    </Description>
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
                </ActivityCard>

                {posthog.isFeatureEnabled('extended-usage-analytics') ? (
                    <>
                        <ActivityCard grid="table-dashboard-views">
                            <Description>Dashboard views (top 20)</Description>
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
                        </ActivityCard>
                        <ActivityCard grid="table-chart-views">
                            <Description>Chart views (top 20)</Description>
                            <Table withColumnBorders ta="left">
                                <thead>
                                    <tr>
                                        <th>Chart name</th>
                                        <th>Views</th>
                                    </tr>
                                </thead>
                                {showTableViews('chart-views', data.chartViews)}
                            </Table>
                        </ActivityCard>
                    </>
                ) : null}
            </Container>
        </Page>
    );
};

export default UserActivity;
