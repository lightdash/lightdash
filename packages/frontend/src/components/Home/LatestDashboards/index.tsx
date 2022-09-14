import { AnchorButton } from '@blueprintjs/core';
import { FC } from 'react';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import LinkButton from '../../common/LinkButton';
import ResourceList from '../../common/ResourceList';

interface Props {
    projectUuid: string;
}

const LatestDashboards: FC<Props> = ({ projectUuid }) => {
    const dashboardsRequest = useDashboards(projectUuid);
    const dashboards = dashboardsRequest.data || [];

    const featuredDashboards = dashboards
        .sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5);

    return (
        <ResourceList
            resourceIcon="control"
            resourceType="dashboard"
            resourceList={featuredDashboards}
            showSpaceColumn
            showCountTag={false}
            headerTitle="Recently updated dashboards"
            headerAction={
                featuredDashboards.length > 0 ? (
                    <LinkButton
                        text={`View all ${featuredDashboards.length}`}
                        minimal
                        outlined
                        intent="primary"
                        href={`/projects/${projectUuid}/dashboards`}
                    />
                ) : (
                    <AnchorButton
                        text="Learn"
                        minimal
                        outlined
                        target="_blank"
                        href="https://docs.lightdash.com/get-started/exploring-data/dashboards/"
                    />
                )
            }
            getURL={({ uuid }) =>
                `/projects/${projectUuid}/dashboards/${uuid}/view`
            }
        />
    );
};

export default LatestDashboards;
