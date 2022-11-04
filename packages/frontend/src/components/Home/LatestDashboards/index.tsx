import { AnchorButton } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useMemo } from 'react';
import { Redirect } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import { useApp } from '../../../providers/AppProvider';
import LinkButton from '../../common/LinkButton';
import ResourceList from '../../common/ResourceList';
import { SortDirection } from '../../common/ResourceList/ResourceTable';
import { DEFAULT_DASHBOARD_NAME } from '../../SpacePanel';

interface Props {
    projectUuid: string;
}

const LatestDashboards: FC<Props> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const {
        isLoading: isCreatingDashboard,
        isSuccess: hasCreatedDashboard,
        mutate: createDashboard,
        data: newDashboard,
    } = useCreateMutation(projectUuid);

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

    if (hasCreatedDashboard && newDashboard) {
        return (
            <Redirect
                push
                to={`/projects/${projectUuid}/dashboards/${newDashboard.uuid}`}
            />
        );
    }

    const userCanViewDashboards = user.data?.ability.can(
        'view',
        subject('Dashboard', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const userCanManageDashboards = user.data?.ability.can(
        'manage',
        subject('Dashboard', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleCreateDashboard = () => {
        createDashboard({
            name: DEFAULT_DASHBOARD_NAME,
            tiles: [],
        });
    };

    return (
        <ResourceList
            resourceIcon="control"
            resourceType="dashboard"
            resourceList={featuredDashboards}
            enableSorting={false}
            defaultSort={{
                updatedAt: SortDirection.DESC,
            }}
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
                ) : userCanViewDashboards ? (
                    <LinkButton
                        text={`View all ${dashboards.length}`}
                        minimal
                        intent="primary"
                        href={`/projects/${projectUuid}/dashboards`}
                    />
                ) : null
            }
            onClickCTA={
                !isDemo && userCanManageDashboards
                    ? handleCreateDashboard
                    : undefined
            }
        />
    );
};

export default LatestDashboards;
