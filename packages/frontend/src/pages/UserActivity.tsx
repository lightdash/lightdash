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
                <td>{user.userUuid}</td>
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

    const series = {
        xAxis: {
            type: 'category',
            data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        },
        yAxis: {
            type: 'value',
        },
        series: [
            {
                data: [150, 230, 224, 218, 135, 147, 260],
                type: 'line',
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
                            <BigNumber>{data.numberOfUsers}</BigNumber>
                            <BigNumberLabel>Number of users</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>
                    <ActivityCard grid="viewers">
                        <BigNumberContainer>
                            <BigNumber>{data.numberOfViewers}</BigNumber>
                            <BigNumberLabel>Number of viewers</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>

                    <ActivityCard grid="editors">
                        <BigNumberContainer>
                            <BigNumber>{data.numberOfEditors}</BigNumber>
                            <BigNumberLabel>Number of editors</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>
                    <ActivityCard grid="admins">
                        <BigNumberContainer>
                            <BigNumber>{data.numberOfAdmins}</BigNumber>
                            <BigNumberLabel>Number of admins</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>
                    <ActivityCard grid="weekly-active">
                        <BigNumberContainer>
                            <BigNumber>% {data.weeklyQueryingUsers}</BigNumber>
                            <BigNumberLabel>
                                % of weekly querying users
                            </BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>

                    <ActivityCard grid="chart-active-users">
                        <EChartsReact notMerge option={series} />
                    </ActivityCard>

                    <ActivityCard grid="queries-per-user">
                        <EChartsReact notMerge option={series} />
                    </ActivityCard>

                    <ActivityCard grid="table-most-queries">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>User ID</th>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of Queries</th>
                            </tr>
                            {showTableBodyWithUsers(
                                'users-most-queries',
                                data.usersWithMostQueries,
                            )}
                        </Table>
                    </ActivityCard>
                    <ActivityCard grid="table-most-charts">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>User ID</th>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of updated charts</th>
                            </tr>
                            {showTableBodyWithUsers(
                                'users-created-most-charts',
                                data.usersCreatedMostCharts,
                            )}
                        </Table>
                    </ActivityCard>
                    <ActivityCard grid="table-not-logged-in">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>User ID</th>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Days since last login</th>
                            </tr>
                            {showTableBodyWithUsers(
                                'users-not-logged-in',
                                data.usersNotLoggedIn,
                            )}
                        </Table>
                    </ActivityCard>
                </Container>
            </Content>
        </Page>
    );
};

export default UserActivity;
