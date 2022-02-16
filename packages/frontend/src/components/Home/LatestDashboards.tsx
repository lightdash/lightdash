import {
    AnchorButton,
    Button,
    Colors,
    Icon,
    Tag,
    Text,
} from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect } from 'react-router-dom';
import styled from 'styled-components';
import { useCreateMutation } from '../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { DEFAULT_DASHBOARD_NAME } from '../../pages/SavedDashboards';
import LinkButton from '../common/LinkButton';
import LatestCard from './LatestCard';

const DashboardLinkButton = styled(LinkButton)`
    .bp3-button-text {
        width: 100%;
        display: flex;
        align-items: center;
        color: rgb(41, 55, 66);
        font-weight: 600;
    }
`;

const LatestDashboards: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const dashboardsRequest = useDashboards(projectUuid);
    const dashboards = dashboardsRequest.data || [];
    const createDashboard = useCreateMutation(projectUuid);

    if (createDashboard.isSuccess && createDashboard.data) {
        return (
            <Redirect
                push
                to={`/projects/${projectUuid}/dashboards/${createDashboard.data.uuid}`}
            />
        );
    }

    return (
        <LatestCard
            isLoading={dashboardsRequest.isLoading}
            title={`Browse dashboards (${dashboards.length})`}
            headerAction={
                dashboards.length > 0 ? (
                    <LinkButton
                        text="View all"
                        minimal
                        outlined
                        href={`/projects/${projectUuid}/dashboards`}
                        style={{ width: 100 }}
                    />
                ) : (
                    <AnchorButton
                        target="_blank"
                        text="Learn"
                        minimal
                        outlined
                        href="https://docs.lightdash.com/get-started/exploring-data/dashboards/"
                        style={{ width: 100 }}
                    />
                )
            }
        >
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gridColumnGap: 28,
                }}
            >
                {dashboards
                    .sort(
                        (a, b) =>
                            new Date(b.updatedAt).getTime() -
                            new Date(a.updatedAt).getTime(),
                    )
                    .slice(0, 3)
                    .map(({ uuid, name }) => (
                        <DashboardLinkButton
                            minimal
                            outlined
                            href={`/projects/${projectUuid}/dashboards/${uuid}`}
                            style={{
                                padding: 15,
                            }}
                        >
                            <Tag
                                round
                                large
                                minimal
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    marginRight: 20,
                                    flexShrink: 0,
                                }}
                                intent="primary"
                            >
                                <Icon icon="dashboard" intent="primary" />
                            </Tag>

                            <Text ellipsize>{name}</Text>
                        </DashboardLinkButton>
                    ))}
                {dashboards.length < 3 && (
                    <Button
                        minimal
                        outlined
                        loading={createDashboard.isLoading}
                        style={{
                            minHeight: 70,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 500,
                            border: `1px dashed ${Colors.GRAY3}`,
                        }}
                        intent="primary"
                        onClick={() =>
                            createDashboard.mutate({
                                name: DEFAULT_DASHBOARD_NAME,
                                tiles: [],
                            })
                        }
                    >
                        + Create a dashboard
                    </Button>
                )}
            </div>
        </LatestCard>
    );
};

export default LatestDashboards;
