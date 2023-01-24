import { Card, NonIdealState, Spinner } from '@blueprintjs/core';
import { UserWithCount } from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import React, { FC } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import Content from '../components/common/Page/Content';
import Page from '../components/common/Page/Page';
import { Table } from '../components/common/Table/Table.styles';
import ForbiddenPanel from '../components/ForbiddenPanel';
import SpacePanel from '../components/SpacePanel';
import ColumnConfiguration from '../components/TableConfigPanel/ColumnConfiguration';
import { useUserActivity } from '../hooks/analytics/useUserActivity';
import { useSpace } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';
import {
    ActivityCard,
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    Container,
} from './UserActivity.styles';

const showTableBodyWithUsers = (key: string, userList: UserWithCount[]) => {
    return userList.map((user) => {
        return (
            <tr key={`${key}-${user.userUuid}`}>
                <td>{user.firstName}</td>
                <td>{user.lastName}</td>
                <td>{user.count}</td>
            </tr>
        );
    });
};

const UserActivity: FC = () => {
    const params = useParams<{ projectUuid: string }>();
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

    const weeklySeries = {
        xAxis: {
            type: 'time',
        },
        yAxis: [
            {
                type: 'value',
                name: 'Queries',
            },
            {
                type: 'value',
                name: 'Percent of weekly \nactive users',
            },
        ],
        series: [
            {
                data: data.chartWeeklyQueryingUsers.map((queries: any) => [
                    queries.date,
                    queries.num_7d_active_users,
                ]),
                type: 'bar',
            },
            {
                yAxisIndex: 1,
                data: data.chartWeeklyQueryingUsers.map((queries: any) => [
                    queries.date,
                    queries.percent_7d_active_users,
                ]),
                type: 'line',
                symbol: 'none',
                smooth: true,
            },
        ],
    };

    const series = {
        xAxis: {
            type: 'time',
        },
        yAxis: {
            type: 'value',
            name: 'Average user queries',
        },
        series: [
            {
                data: data.chartWeeklyAverageQueries.map((queries: any) => [
                    queries.date,
                    queries.average_number_of_weekly_queries_per_user,
                ]),
                type: 'line',
                symbol: 'none',
                smooth: true,
            },
        ],
    };

    return (
        <Page>
            <Helmet>
                <title>User activity - Lightdash</title>
            </Helmet>
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
                            <BigNumberLabel>Number of viewers</BigNumberLabel>
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
                                % {data.numberWeeklyQueryingUsers}
                            </BigNumber>
                            <BigNumberLabel>
                                % of weekly querying users
                            </BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>

                    <ActivityCard grid="chart-active-users">
                        <EChartsReact notMerge option={weeklySeries} />
                    </ActivityCard>

                    <ActivityCard grid="queries-per-user">
                        <EChartsReact notMerge option={series} />
                    </ActivityCard>

                    <ActivityCard grid="table-most-queries">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of Queries</th>
                            </tr>
                            {showTableBodyWithUsers(
                                'users-most-queries',
                                data.tableMostQueries,
                            )}
                        </Table>
                    </ActivityCard>
                    <ActivityCard grid="table-most-charts">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of updated charts</th>
                            </tr>
                            {showTableBodyWithUsers(
                                'users-created-most-charts',
                                data.tableMostCreatedCharts,
                            )}
                        </Table>
                    </ActivityCard>
                    <ActivityCard grid="table-not-logged-in">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Days since last login</th>
                            </tr>
                            {showTableBodyWithUsers(
                                'users-not-logged-in',
                                data.tableNoQueries,
                            )}
                        </Table>
                    </ActivityCard>
                </Container>
            </Content>
        </Page>
    );
};

export default UserActivity;
