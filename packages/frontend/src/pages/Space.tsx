import {
    Intent,
    Menu,
    NonIdealState,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { ActionIcon, Center, Group, Stack } from '@mantine/core';
import {
    IconChartAreaLine,
    IconDots,
    IconLayoutDashboard,
    IconPlus,
} from '@tabler/icons-react';
import React, { FC, useCallback, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { Can } from '../components/common/Authorization';
import ErrorState from '../components/common/ErrorState';
import LoadingState from '../components/common/LoadingState';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ShareSpaceModal from '../components/common/ShareSpaceModal';
import SpaceActionModal, {
    ActionType,
} from '../components/common/SpaceActionModal';
import AddResourceToSpaceMenu from '../components/Explorer/SpaceBrowser/AddResourceToSpaceMenu';
import AddResourceToSpaceModal, {
    AddToSpaceResources,
} from '../components/Explorer/SpaceBrowser/AddResourceToSpaceModal';
import CreateResourceToSpace from '../components/Explorer/SpaceBrowser/CreateResourceToSpace';
import { SpaceBrowserMenu } from '../components/Explorer/SpaceBrowser/SpaceBrowserMenu';
import ForbiddenPanel from '../components/ForbiddenPanel';
import SpacePanel from '../components/SpacePanel';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import { useSpacePinningMutation } from '../hooks/pinning/useSpaceMutation';
import { useSavedCharts, useSpace } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const Space: FC = () => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();
    const { data: space, isLoading, error } = useSpace(projectUuid, spaceUuid);
    const { mutate: pinSpace } = useSpacePinningMutation(projectUuid);
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const history = useHistory();
    const location = useLocation();

    const [updateSpace, setUpdateSpace] = useState<boolean>(false);
    const [deleteSpace, setDeleteSpace] = useState<boolean>(false);
    const [createToSpace, setCreateToSpace] = useState<AddToSpaceResources>();
    const [addToSpace, setAddToSpace] = useState<AddToSpaceResources>();
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

    const handlePinToggleSpace = useCallback(
        (spaceId: string) => pinSpace(spaceId),
        [pinSpace],
    );

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

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

    if (isLoading) {
        return <LoadingState title="Loading items" />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (space === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Space does not exist"
                    description={`We could not find space with uuid ${spaceUuid}`}
                />
            </div>
        );
    }

    const renderSpaceBrowserMenu = () => {
        return (
            <SpaceBrowserMenu
                onRename={() => setUpdateSpace(true)}
                onDelete={() => setDeleteSpace(true)}
                onTogglePin={() => handlePinToggleSpace(space?.uuid)}
                isPinned={!!space?.pinnedListUuid}
            >
                <ActionIcon variant="default" size={36}>
                    <IconDots size={20} />
                </ActionIcon>
            </SpaceBrowserMenu>
        );
    };

    const renderUpdateSpaceModal = () => {
        return (
            <SpaceActionModal
                projectUuid={projectUuid}
                spaceUuid={space?.uuid}
                actionType={ActionType.UPDATE}
                title="Update space"
                confirmButtonLabel="Update"
                icon="folder-close"
                onClose={() => setUpdateSpace(false)}
            />
        );
    };

    const renderDeleteSpaceModal = () => {
        return (
            <SpaceActionModal
                projectUuid={projectUuid}
                spaceUuid={space?.uuid}
                actionType={ActionType.DELETE}
                title="Delete space"
                confirmButtonLabel="Delete"
                confirmButtonIntent={Intent.DANGER}
                icon="folder-close"
                onSubmitForm={() => {
                    if (location.pathname.includes(space?.uuid)) {
                        //Redirect to home if we are on the space we are deleting
                        history.push(`/projects/${projectUuid}/home`);
                    }
                }}
                onClose={() => {
                    setDeleteSpace(false);
                }}
            />
        );
    };

    const renderAddItemMenu = () => {
        return (
            <Popover2
                captureDismiss
                position={PopoverPosition.BOTTOM_RIGHT}
                content={
                    <Menu>
                        {userCanManageDashboards && (
                            <MenuItem2
                                icon={<IconLayoutDashboard size={20} />}
                                text={`Add dashboard`}
                            >
                                <AddResourceToSpaceMenu
                                    resourceType={AddToSpaceResources.DASHBOARD}
                                    onAdd={() =>
                                        setAddToSpace(
                                            AddToSpaceResources.DASHBOARD,
                                        )
                                    }
                                    onCreate={() =>
                                        setIsCreateDashboardOpen(true)
                                    }
                                    hasSavedResources={!!dashboards.length}
                                />
                            </MenuItem2>
                        )}
                        {userCanManageCharts && (
                            <MenuItem2
                                icon={<IconChartAreaLine size={20} />}
                                text={`Add chart`}
                            >
                                <AddResourceToSpaceMenu
                                    resourceType={AddToSpaceResources.CHART}
                                    onAdd={() =>
                                        setAddToSpace(AddToSpaceResources.CHART)
                                    }
                                    onCreate={() =>
                                        setCreateToSpace(
                                            AddToSpaceResources.CHART,
                                        )
                                    }
                                    hasSavedResources={!!savedCharts.length}
                                />
                            </MenuItem2>
                        )}
                    </Menu>
                }
            >
                <ActionIcon size={36} color="blue" variant="filled">
                    <IconPlus size={20} />
                </ActionIcon>
            </Popover2>
        );
    };

    return (
        <Center my="md">
            <Helmet>
                <title>{space?.name} - Lightdash</title>
            </Helmet>
            <Stack spacing="xl" w={900}>
                <Group position="apart" mt="xs">
                    <PageBreadcrumbs
                        items={[
                            {
                                href: `/projects/${projectUuid}/spaces`,
                                title: 'Spaces',
                            },
                        ]}
                        mt="xs"
                    >
                        {space.name}
                    </PageBreadcrumbs>
                    <Group spacing="xs">
                        <Can
                            I="manage"
                            this={subject('Space', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            {!isDemo &&
                                (userCanManageDashboards ||
                                    userCanManageCharts) &&
                                renderAddItemMenu()}
                            <ShareSpaceModal
                                space={space!}
                                projectUuid={projectUuid}
                            />
                            {renderSpaceBrowserMenu()}
                            {updateSpace && renderUpdateSpaceModal()}
                            {deleteSpace && renderDeleteSpaceModal()}
                            {createToSpace && (
                                <CreateResourceToSpace
                                    resourceType={createToSpace}
                                />
                            )}
                            {addToSpace && (
                                <AddResourceToSpaceModal
                                    isOpen
                                    resourceType={addToSpace}
                                    onClose={() => setAddToSpace(undefined)}
                                />
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
                        </Can>
                    </Group>
                </Group>
                <SpacePanel space={space} />
            </Stack>
        </Center>
    );
};

export default Space;
