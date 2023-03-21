import { Button, Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { LightdashMode, Space } from '@lightdash/common';
import { IconChartAreaLine, IconLayoutDashboard } from '@tabler/icons-react';
import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedCharts } from '../../hooks/useSpaces';
import { useApp } from '../../providers/AppProvider';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';
import ResourceView from '../common/ResourceView';
import { ResourceTypeIcon } from '../common/ResourceView/ResourceIcon';
import {
    ResourceViewItemType,
    wrapResourceView,
} from '../common/ResourceView/resourceTypeUtils';
import AddResourceToSpaceMenu from '../Explorer/SpaceBrowser/AddResourceToSpaceMenu';
import AddResourceToSpaceModal, {
    AddToSpaceResources,
} from '../Explorer/SpaceBrowser/AddResourceToSpaceModal';
import CreateResourceToSpace from '../Explorer/SpaceBrowser/CreateResourceToSpace';

interface Props {
    space: Space;
}

export const SpacePanel: React.FC<Props> = ({ space }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user, health } = useApp();
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const history = useHistory();
    const dashboardsInSpace = space.dashboards;
    const chartsInSpace = space.queries;

    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);
    const [addToSpace, setAddToSpace] = useState<AddToSpaceResources>();
    const [createToSpace, setCreateToSpace] = useState<AddToSpaceResources>();

    const userCanManageDashboards = user.data?.ability?.can(
        'manage',
        subject('Dashboard', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const userCanManageCharts = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const allItems = [
        ...wrapResourceView(dashboardsInSpace, ResourceViewItemType.DASHBOARD),
        ...wrapResourceView(chartsInSpace, ResourceViewItemType.CHART),
    ];

    return (
        <>
            <ResourceView
                items={allItems}
                listProps={{
                    defaultColumnVisibility: { space: false },
                }}
                tabs={[
                    {
                        id: 'all-items',
                        name: 'All items',
                    },
                    {
                        id: 'dashboards',
                        icon: (
                            <ResourceTypeIcon
                                type={ResourceViewItemType.DASHBOARD}
                            />
                        ),
                        name: 'Dashboards',
                        filter: (item) =>
                            item.type === ResourceViewItemType.DASHBOARD,
                    },
                    {
                        id: 'charts',
                        icon: (
                            <ResourceTypeIcon
                                type={ResourceViewItemType.CHART}
                            />
                        ),
                        name: 'Charts',
                        filter: (item) =>
                            item.type === ResourceViewItemType.CHART,
                    },
                ]}
                headerProps={{
                    action: !isDemo &&
                        (userCanManageDashboards || userCanManageCharts) && (
                            <Popover2
                                captureDismiss
                                position={PopoverPosition.BOTTOM_RIGHT}
                                content={
                                    <Menu>
                                        {userCanManageDashboards && (
                                            <MenuItem2
                                                icon={
                                                    <IconLayoutDashboard
                                                        size={20}
                                                    />
                                                }
                                                text={`Add dashboard`}
                                            >
                                                <AddResourceToSpaceMenu
                                                    resourceType={
                                                        AddToSpaceResources.DASHBOARD
                                                    }
                                                    onAdd={() =>
                                                        setAddToSpace(
                                                            AddToSpaceResources.DASHBOARD,
                                                        )
                                                    }
                                                    onCreate={() =>
                                                        setIsCreateDashboardOpen(
                                                            true,
                                                        )
                                                    }
                                                    hasSavedResources={
                                                        !!dashboards.length
                                                    }
                                                />
                                            </MenuItem2>
                                        )}
                                        {userCanManageCharts && (
                                            <MenuItem2
                                                icon={
                                                    <IconChartAreaLine
                                                        size={20}
                                                    />
                                                }
                                                text={`Add chart`}
                                            >
                                                <AddResourceToSpaceMenu
                                                    resourceType={
                                                        AddToSpaceResources.CHART
                                                    }
                                                    onAdd={() =>
                                                        setAddToSpace(
                                                            AddToSpaceResources.CHART,
                                                        )
                                                    }
                                                    onCreate={() =>
                                                        setCreateToSpace(
                                                            AddToSpaceResources.CHART,
                                                        )
                                                    }
                                                    hasSavedResources={
                                                        !!savedCharts.length
                                                    }
                                                />
                                            </MenuItem2>
                                        )}
                                    </Menu>
                                }
                            >
                                <Button icon="plus" intent="primary" />
                            </Popover2>
                        ),
                }}
                emptyStateProps={{
                    icon: <IconLayoutDashboard size={30} />,
                    title: 'No items added yet',
                }}
            />

            {addToSpace && (
                <AddResourceToSpaceModal
                    isOpen
                    resourceType={addToSpace}
                    onClose={() => setAddToSpace(undefined)}
                />
            )}

            {createToSpace && (
                <CreateResourceToSpace resourceType={createToSpace} />
            )}

            <DashboardCreateModal
                projectUuid={projectUuid}
                spaceUuid={space.uuid}
                isOpen={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    history.push(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </>
    );
};

export default SpacePanel;
