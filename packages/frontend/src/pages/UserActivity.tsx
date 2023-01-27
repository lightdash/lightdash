import { Classes, Icon, NonIdealState, Spinner } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import {
    UserActivity as UserActivityResponse,
    UserWithCount,
} from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useParams } from 'react-router-dom';
import Content from '../components/common/Page/Content';
import Page from '../components/common/Page/Page';
import { PageBreadcrumbsWrapper } from '../components/common/Page/Page.styles';
import {
    PageHeaderContainer,
    PageTitleAndDetailsContainer,
    PageTitleContainer,
} from '../components/common/PageHeader';
import { ResourceBreadcrumbTitle } from '../components/common/ResourceList/ResourceList.styles';
import { Table, Td } from '../components/common/Table/Table.styles';
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
} from './UserActivity.styles';

const showTableBodyWithUsers = (key: string, userList: UserWithCount[]) => {
    return (
        <tbody>
            {userList.map((user, index) => {
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
            color: '#7262ff',
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
            color: '#d7c1fa',
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
    const history = useHistory();
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
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>User activity for {project?.name} - Lightdash</title>
            </Helmet>
            <PageHeaderContainer>
                <PageTitleAndDetailsContainer>
                    <PageTitleContainer
                        className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                    >
                        <PageBreadcrumbsWrapper>
                            <Breadcrumbs2
                                items={[
                                    {
                                        text: 'Usage analytics',
                                        className: 'home-breadcrumb',
                                        onClick: (e) => {
                                            history.push(
                                                `/generalSettings/projectManagement/${params.projectUuid}/usageAnalytics`,
                                            );
                                        },
                                    },
                                    {
                                        text: (
                                            <ResourceBreadcrumbTitle>
                                                <Icon icon="people" size={20} />{' '}
                                                User activity for{' '}
                                                {project?.name}
                                            </ResourceBreadcrumbTitle>
                                        ),
                                    },
                                ]}
                            />
                        </PageBreadcrumbsWrapper>
                    </PageTitleContainer>
                </PageTitleAndDetailsContainer>
            </PageHeaderContainer>
            <Page>
                <Content>
                    <Container>
                        <ActivityCard grid="total-users">
                            <BigNumberContainer>
                                <BigNumber>{data.numberUsers}</BigNumber>
                                <BigNumberLabel>Number of users</BigNumberLabel>
                            </BigNumberContainer>
                        </ActivityCard>
                        <ActivityCard grid="viewers">
                            <BigNumberContainer>
                                <BigNumber>{data.numberViewers}</BigNumber>
                                <BigNumberLabel>
                                    Number of viewers
                                </BigNumberLabel>
                            </BigNumberContainer>
                        </ActivityCard>

                        <ActivityCard grid="editors">
                            <BigNumberContainer>
                                <BigNumber>{data.numberEditors}</BigNumber>
                                <BigNumberLabel>
                                    Number of editors
                                </BigNumberLabel>
                            </BigNumberContainer>
                        </ActivityCard>
                        <ActivityCard grid="admins">
                            <BigNumberContainer>
                                <BigNumber>{data.numberAdmins}</BigNumber>
                                <BigNumberLabel>
                                    Number of admins
                                </BigNumberLabel>
                            </BigNumberContainer>
                        </ActivityCard>
                        <ActivityCard grid="weekly-active">
                            <BigNumberContainer>
                                <BigNumber>
                                    {data.numberWeeklyQueryingUsers} %
                                </BigNumber>
                                <BigNumberLabel>
                                    % of weekly querying users
                                </BigNumberLabel>
                            </BigNumberContainer>
                        </ActivityCard>

                        <ChartCard grid="chart-active-users">
                            <Description>
                                How many users are querying this project,
                                weekly?
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
                                Which users have run the most queries in the
                                last 7 days? (top 10)
                            </Description>

                            <Table bordered condensed $showFooter={false}>
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
                                Which users have made the most updates to charts
                                in the last 7 days? (top 10)
                            </Description>

                            <Table bordered condensed $showFooter={false}>
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
                                Which users have not run queries in the last 90
                                days?
                            </Description>
                            <Table bordered condensed $showFooter={false}>
                                <thead>
                                    <tr>
                                        <th>First Name</th>
                                        <th>Last Name</th>
                                        <th>Days since last login</th>
                                    </tr>
                                </thead>
                                {showTableBodyWithUsers(
                                    'users-not-logged-in',
                                    data.tableNoQueries,
                                )}
                            </Table>
                        </ActivityCard>
                    </Container>
                </Content>
            </Page>
        </>
    );
};

export default UserActivity;
