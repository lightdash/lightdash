import { subject } from '@casl/ability';
import {
    ContentType,
    LightdashMode,
    ResourceViewItemType,
    type ResourceViewSpaceItem,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Menu, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDots,
    IconFolderCog,
    IconFolderPlus,
    IconFolderX,
    IconPlus,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import AddResourceToSpaceModal from '../components/Explorer/SpaceBrowser/AddResourceToSpaceModal';
import CreateResourceToSpace from '../components/Explorer/SpaceBrowser/CreateResourceToSpace';
import { SpaceBrowserMenu } from '../components/Explorer/SpaceBrowser/SpaceBrowserMenu';
import { AddToSpaceResources } from '../components/Explorer/SpaceBrowser/types';
import ForbiddenPanel from '../components/ForbiddenPanel';
import ErrorState from '../components/common/ErrorState';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';
import ShareSpaceModal from '../components/common/ShareSpaceModal';
import SpaceActionModal from '../components/common/SpaceActionModal';
import { ActionType } from '../components/common/SpaceActionModal/types';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import TransferItemsModal from '../components/common/TransferItemsModal/TransferItemsModal';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import { useSpacePinningMutation } from '../hooks/pinning/useSpaceMutation';
import { useContentAction } from '../hooks/useContent';
import { useSpace } from '../hooks/useSpaces';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';

const Space: FC = () => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>() as {
        projectUuid: string;
        spaceUuid: string;
    };
    const {
        data: space,
        isInitialLoading,
        error,
    } = useSpace(projectUuid, spaceUuid);

    const { mutate: pinSpace } = useSpacePinningMutation(projectUuid);
    const { user, health } = useApp();
    const { track } = useTracking();

    const userCanManageSpace = user.data?.ability?.can(
        'create',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const navigate = useNavigate();
    const location = useLocation();

    const [updateSpace, setUpdateSpace] = useState<boolean>(false);
    const [deleteSpace, setDeleteSpace] = useState<boolean>(false);
    const [
        isTransferToSpaceOpen,
        { open: openTransferToSpace, close: closeTransferToSpace },
    ] = useDisclosure(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);
    const [isCreateNestedSpaceOpen, setIsCreateNestedSpaceOpen] =
        useState<boolean>(false);
    const [addToSpace, setAddToSpace] = useState<AddToSpaceResources>();
    const [createToSpace, setCreateToSpace] = useState<AddToSpaceResources>();

    const { mutateAsync: contentAction, isLoading: isContentActionLoading } =
        useContentAction(projectUuid);

    const handlePinToggleSpace = useCallback(
        (spaceId: string) => pinSpace(spaceId),
        [pinSpace],
    );

    if (isInitialLoading) {
        return <LoadingState title="Loading space" />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (space === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Space does not exist"
                    description={`We could not find space with uuid ${spaceUuid}`}
                />
            </div>
        );
    }

    if (user.data?.ability?.cannot('view', subject('Space', { ...space }))) {
        return <ForbiddenPanel />;
    }

    const userCanCreateDashboards = user.data?.ability?.can(
        'create',
        subject('Dashboard', { ...space }),
    );

    const userCanCreateCharts = user.data?.ability?.can(
        'create',
        subject('SavedChart', { ...space }),
    );

    const userCanManageSpaceAndHasNoDirectAccessToSpace =
        user.data?.ability?.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            }),
        ) &&
        !space.access.find((a) => a.userUuid === user.data?.userUuid)
            ?.hasDirectAccess;

    return (
        <Page
            title={space?.name}
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack spacing="xxl" w="100%">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            {
                                title: 'Spaces',
                                to: `/projects/${projectUuid}/spaces`,
                            },
                            ...(space.breadcrumbs?.map((breadcrumb, index) => ({
                                title: breadcrumb.name,
                                active:
                                    index ===
                                    (space.breadcrumbs?.length ?? 0) - 1,
                                to: `/projects/${projectUuid}/spaces/${breadcrumb.uuid}`,
                                onClick: () => {
                                    if (
                                        user.data?.userUuid &&
                                        user.data?.organizationUuid
                                    ) {
                                        track({
                                            name: EventName.SPACE_BREADCRUMB_CLICKED,
                                            properties: {
                                                userId: user.data?.userUuid,
                                                organizationId:
                                                    user.data?.organizationUuid,
                                                projectId: projectUuid,
                                            },
                                        });
                                    }
                                },
                            })) ?? []),
                        ]}
                    />

                    <Group spacing="xs">
                        {!isDemo &&
                            (userCanCreateDashboards ||
                                userCanCreateCharts ||
                                userCanManageSpace) && (
                                <Menu
                                    position="bottom-end"
                                    shadow="md"
                                    closeOnItemClick
                                    withArrow
                                    arrowPosition="center"
                                >
                                    <Menu.Target>
                                        <Box>
                                            <Button
                                                data-testid="Space/AddButton"
                                                leftIcon={
                                                    <MantineIcon
                                                        icon={IconPlus}
                                                    />
                                                }
                                            >
                                                Add
                                            </Button>
                                        </Box>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        {userCanManageSpace && (
                                            <>
                                                <Menu.Item
                                                    icon={
                                                        <MantineIcon
                                                            icon={
                                                                IconFolderPlus
                                                            }
                                                        />
                                                    }
                                                    onClick={() => {
                                                        setIsCreateNestedSpaceOpen(
                                                            true,
                                                        );
                                                    }}
                                                >
                                                    Create space
                                                </Menu.Item>
                                                <Menu.Divider />
                                            </>
                                        )}

                                        {userCanCreateDashboards ? (
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={IconPlus}
                                                    />
                                                }
                                                onClick={() => {
                                                    setIsCreateDashboardOpen(
                                                        true,
                                                    );
                                                }}
                                            >
                                                Create new dashboard
                                            </Menu.Item>
                                        ) : null}

                                        {userCanCreateCharts ? (
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={IconPlus}
                                                    />
                                                }
                                                onClick={() => {
                                                    setCreateToSpace(
                                                        AddToSpaceResources.CHART,
                                                    );
                                                }}
                                            >
                                                Create new chart
                                            </Menu.Item>
                                        ) : null}
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                        <Can I="manage" this={subject('Space', space)}>
                            {!!space && (
                                <ShareSpaceModal
                                    space={space}
                                    projectUuid={projectUuid}
                                />
                            )}
                            <SpaceBrowserMenu
                                onRename={() => setUpdateSpace(true)}
                                onDelete={() => setDeleteSpace(true)}
                                onTogglePin={() =>
                                    handlePinToggleSpace(space?.uuid)
                                }
                                onTransferToSpace={() => {
                                    openTransferToSpace();
                                }}
                                isPinned={!!space?.pinnedListUuid}
                            >
                                <ActionIcon variant="default" size={36}>
                                    <MantineIcon icon={IconDots} size="lg" />
                                </ActionIcon>
                            </SpaceBrowserMenu>
                            {updateSpace && (
                                <SpaceActionModal
                                    projectUuid={projectUuid}
                                    spaceUuid={space?.uuid}
                                    actionType={ActionType.UPDATE}
                                    title="Update space"
                                    confirmButtonLabel="Update"
                                    icon={IconFolderCog}
                                    onClose={() => setUpdateSpace(false)}
                                    parentSpaceUuid={space.parentSpaceUuid}
                                />
                            )}
                            {deleteSpace && (
                                <SpaceActionModal
                                    projectUuid={projectUuid}
                                    spaceUuid={space?.uuid}
                                    actionType={ActionType.DELETE}
                                    parentSpaceUuid={null}
                                    title="Delete space"
                                    confirmButtonLabel="Delete"
                                    confirmButtonColor="red"
                                    icon={IconFolderX}
                                    onSubmitForm={() => {
                                        if (
                                            location.pathname.includes(
                                                space?.uuid,
                                            )
                                        ) {
                                            //Redirect to home if we are on the space we are deleting
                                            void navigate(
                                                `/projects/${projectUuid}/home`,
                                            );
                                        }
                                    }}
                                    onClose={() => {
                                        setDeleteSpace(false);
                                    }}
                                />
                            )}
                        </Can>
                    </Group>
                </Group>
                <InfiniteResourceTable
                    filters={{
                        projectUuid,
                        spaceUuids: [spaceUuid],
                        contentTypes: [
                            ContentType.DASHBOARD,
                            ContentType.CHART,
                            ContentType.SPACE,
                        ],
                    }}
                    contentTypeFilter={{
                        defaultValue: undefined,
                        options: [ContentType.DASHBOARD, ContentType.CHART],
                    }}
                    columnVisibility={{
                        [ColumnVisibility.SPACE]: false,
                    }}
                    enableBottomToolbar={false}
                    enableRowSelection={userCanManageSpace}
                    initialAdminContentViewValue={
                        userCanManageSpaceAndHasNoDirectAccessToSpace
                            ? 'all'
                            : 'shared'
                    }
                />

                {addToSpace && (
                    <AddResourceToSpaceModal
                        resourceType={addToSpace}
                        onClose={() => setAddToSpace(undefined)}
                    />
                )}

                {createToSpace && (
                    <CreateResourceToSpace resourceType={createToSpace} />
                )}
                <DashboardCreateModal
                    projectUuid={projectUuid}
                    defaultSpaceUuid={space.uuid}
                    opened={isCreateDashboardOpen}
                    onClose={() => setIsCreateDashboardOpen(false)}
                    onConfirm={(dashboard) => {
                        void navigate(
                            `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                        );

                        setIsCreateDashboardOpen(false);
                    }}
                />

                {isCreateNestedSpaceOpen && (
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        actionType={ActionType.CREATE}
                        parentSpaceUuid={space.uuid}
                        title={`Create space in "${space.name}"`}
                        confirmButtonLabel="Create"
                        icon={IconFolderPlus}
                        onClose={() => setIsCreateNestedSpaceOpen(false)}
                        spaceUuid={spaceUuid}
                        onSubmitForm={() => {
                            setIsCreateNestedSpaceOpen(false);
                        }}
                        shouldRedirect={false}
                    />
                )}

                {isTransferToSpaceOpen && (
                    <TransferItemsModal
                        projectUuid={projectUuid}
                        opened
                        items={[
                            {
                                data: {
                                    ...space,
                                    access: [],
                                    accessListLength: 0,
                                    dashboardCount: 0,
                                    chartCount: 0,
                                },
                                type: ResourceViewItemType.SPACE,
                            } satisfies ResourceViewSpaceItem,
                        ]}
                        isLoading={isContentActionLoading}
                        onClose={closeTransferToSpace}
                        onConfirm={async (newSpaceUuid) => {
                            await contentAction({
                                action: {
                                    type: 'move',
                                    targetSpaceUuid: newSpaceUuid,
                                },
                                item: {
                                    uuid: space.uuid,
                                    contentType: ContentType.SPACE,
                                },
                            });

                            closeTransferToSpace();
                        }}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default Space;
