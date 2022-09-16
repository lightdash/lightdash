import { AnchorButton } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useMemo } from 'react';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import { useApp } from '../../../providers/AppProvider';
import LinkButton from '../../common/LinkButton';
import ResourceList from '../../common/ResourceList';

interface Props {
    projectUuid: string;
}

const LatestDashboards: FC<Props> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: dashboards = [] } = useDashboards(projectUuid);

    const featuredDashboards = useMemo(() => {
        return dashboards
            .sort((a, b) => {
                return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                );
            })
            .slice(0, 5);
    }, [dashboards]);

    const userCanManageDashboards = user.data?.ability?.can(
        'manage',
        subject('Dashboard', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    return (
        <ResourceList
            resourceIcon="control"
            resourceType="dashboard"
            resourceList={featuredDashboards}
            showSpaceColumn
            enableSorting={false}
            showCount={false}
            getURL={({ uuid }) =>
                `/projects/${projectUuid}/dashboards/${uuid}/view`
            }
            headerTitle="Recently updated dashboards"
            headerAction={
                dashboards.length === 0 ? (
                    <AnchorButton
                        text="Learn"
                        minimal
                        target="_blank"
                        href="https://docs.lightdash.com/get-started/exploring-data/dashboards/"
                    />
                ) : userCanManageDashboards && !isDemo ? (
                    <LinkButton
                        text={`View all ${dashboards.length}`}
                        minimal
                        intent="primary"
                        href={`/projects/${projectUuid}/dashboards`}
                    />
                ) : null
            }
        />
    );
};

export default LatestDashboards;
