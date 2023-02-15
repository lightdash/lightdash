import { Button, Intent, Menu, PopoverPosition } from '@blueprintjs/core';
import { Breadcrumbs2, MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { LightdashMode, Space } from '@lightdash/common';
import { IconChartAreaLine, IconLayoutDashboard } from '@tabler/icons-react';
import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';
import {
    PageBreadcrumbsWrapper,
    PageContentWrapper,
    PageHeader,
} from '../common/Page/Page.styles';
import ResourceList from '../common/ResourceList';
import {
    ResourceEmptyStateHeader,
    ResourceEmptyStateIcon,
} from '../common/ResourceList/ResourceList.styles';
import { SortDirection } from '../common/ResourceList/ResourceTable';
import {
    ResourceListType,
    wrapResourceList,
} from '../common/ResourceList/ResourceTypeUtils';
import ShareSpaceModal from '../common/ShareSpaceModal';
import SpaceActionModal, { ActionType } from '../common/SpaceActionModal';
import AddResourceToSpaceMenu from '../Explorer/SpaceBrowser/AddResourceToSpaceMenu';
import AddResourceToSpaceModal, {
    AddToSpaceResources,
} from '../Explorer/SpaceBrowser/AddResourceToSpaceModal';
import CreateResourceToSpace from '../Explorer/SpaceBrowser/CreateResourceToSpace';
import { SpaceBrowserMenu } from '../Explorer/SpaceBrowser/SpaceBrowserMenu';

interface Props {
    space: Space;
}

export const SpacePanel: React.FC<Props> = ({ space }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const history = useHistory();
    const savedDashboards = space.dashboards;
    const savedCharts = space.queries;

    const [updateSpace, setUpdateSpace] = useState<boolean>(false);
    const [deleteSpace, setDeleteSpace] = useState<boolean>(false);
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
        ...wrapResourceList(savedDashboards, ResourceListType.DASHBOARD),
        ...wrapResourceList(savedCharts, ResourceListType.CHART),
    ];

    return (
        <PageContentWrapper>
            <PageHeader>
                <PageBreadcrumbsWrapper>
                    <Breadcrumbs2
                        items={[
                            {
                                text: 'All spaces',
                                className: 'home-breadcrumb',
                                onClick: () =>
                                    history.push(
                                        `/projects/${projectUuid}/spaces`,
                                    ),
                            },
                            { text: space.name },
                        ]}
                    />
                </PageBreadcrumbsWrapper>

                <div>
                    <Can
                        I="manage"
                        this={subject('Space', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <ShareSpaceModal
                            space={space}
                            projectUuid={projectUuid}
                        />
                    </Can>

                    <SpaceBrowserMenu
                        onRename={() => setUpdateSpace(true)}
                        onDelete={() => setDeleteSpace(true)}
                    >
                        <Can
                            I="manage"
                            this={subject('Space', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Button icon="more" />
                        </Can>
                    </SpaceBrowserMenu>
                </div>
                {updateSpace && (
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        spaceUuid={space.uuid}
                        actionType={ActionType.UPDATE}
                        title="Update space"
                        confirmButtonLabel="Update"
                        icon="folder-close"
                        onClose={() => setUpdateSpace(false)}
                    />
                )}

                {deleteSpace && (
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        spaceUuid={space.uuid}
                        actionType={ActionType.DELETE}
                        title="Delete space"
                        confirmButtonLabel="Delete"
                        confirmButtonIntent={Intent.DANGER}
                        icon="folder-close"
                        onClose={() => setDeleteSpace(false)}
                    />
                )}
            </PageHeader>
            <ResourceList
                items={allItems}
                defaultSort={{ type: SortDirection.DESC }}
                defaultColumnVisibility={{ space: false, type: false }}
                headerTitle="All items"
                showCount={false}
                headerAction={
                    !isDemo && (
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
                                            />
                                        </MenuItem2>
                                    )}
                                    {userCanManageCharts && (
                                        <MenuItem2
                                            icon={
                                                <IconChartAreaLine size={20} />
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
                                            />
                                        </MenuItem2>
                                    )}
                                </Menu>
                            }
                        >
                            <Button icon="plus" intent="primary" />
                        </Popover2>
                    )
                }
                renderEmptyState={() => (
                    <>
                        <ResourceEmptyStateIcon icon="control" size={40} />
                        <ResourceEmptyStateHeader>
                            No items added yet
                        </ResourceEmptyStateHeader>
                    </>
                )}
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
                isOpen={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    history.push(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </PageContentWrapper>
    );
};

export default SpacePanel;
