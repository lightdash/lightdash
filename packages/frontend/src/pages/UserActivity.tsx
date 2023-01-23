import { Card, NonIdealState, Spinner } from '@blueprintjs/core';
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

const UserActivity: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const { user } = useApp();

    const { data, isLoading } = useUserActivity(params.projectUuid);
    if (user.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (isLoading) {
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
                            <BigNumber>55</BigNumber>
                            <BigNumberLabel>Number of users</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>
                    <ActivityCard grid="viewers">
                        <BigNumberContainer>
                            <BigNumber>40</BigNumber>
                            <BigNumberLabel>Number of viewers</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>

                    <ActivityCard grid="editors">
                        <BigNumberContainer>
                            <BigNumber>10</BigNumber>
                            <BigNumberLabel>Number of editors</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>
                    <ActivityCard grid="admins">
                        <BigNumberContainer>
                            <BigNumber>10</BigNumber>
                            <BigNumberLabel>Number of admins</BigNumberLabel>
                        </BigNumberContainer>
                    </ActivityCard>
                    <ActivityCard grid="weekly-active">
                        <BigNumberContainer>
                            <BigNumber>% 75</BigNumber>
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
                            <tr>
                                <td>535325</td>
                                <td>Katie</td>
                                <td>Hidson</td>
                                <td>500</td>
                            </tr>
                            <tr>
                                <td>123123</td>
                                <td>Javier</td>
                                <td>Rengel</td>
                                <td>100</td>
                            </tr>
                        </Table>
                    </ActivityCard>
                    <ActivityCard grid="table-most-charts">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>User ID</th>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of Queries</th>
                            </tr>
                            <tr>
                                <td>535325</td>
                                <td>Katie</td>
                                <td>Hidson</td>
                                <td>500</td>
                            </tr>
                            <tr>
                                <td>123123</td>
                                <td>Javier</td>
                                <td>Rengel</td>
                                <td>100</td>
                            </tr>
                        </Table>
                    </ActivityCard>
                    <ActivityCard grid="table-not-logged-in">
                        <Table bordered condensed $showFooter={false}>
                            <tr>
                                <th>User ID</th>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Number of Queries</th>
                            </tr>
                            <tr>
                                <td>535325</td>
                                <td>Katie</td>
                                <td>Hidson</td>
                                <td>500</td>
                            </tr>
                            <tr>
                                <td>123123</td>
                                <td>Javier</td>
                                <td>Rengel</td>
                                <td>100</td>
                            </tr>
                        </Table>
                    </ActivityCard>
                </Container>
            </Content>
        </Page>
    );
};

export default UserActivity;
