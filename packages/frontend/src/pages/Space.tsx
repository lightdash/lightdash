import { subject } from '@casl/ability';
import {
    contentToResourceViewItems,
    LightdashMode,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, Stack } from '@mantine/core';
import {
    IconDots,
    IconFolderCog,
    IconFolderX,
    IconLayoutDashboard,
    IconPlus,
    IconSquarePlus,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { Can } from '../components/common/Authorization';
import ErrorState from '../components/common/ErrorState';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { ResourceTypeIcon } from '../components/common/ResourceIcon';
import ResourceView from '../components/common/ResourceView';
import ShareSpaceModal from '../components/common/ShareSpaceModal';
import SpaceActionModal, {
    ActionType,
} from '../components/common/SpaceActionModal';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import AddResourceToSpaceModal, {
    AddToSpaceResources,
} from '../components/Explorer/SpaceBrowser/AddResourceToSpaceModal';
import CreateResourceToSpace from '../components/Explorer/SpaceBrowser/CreateResourceToSpace';
import { SpaceBrowserMenu } from '../components/Explorer/SpaceBrowser/SpaceBrowserMenu';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useSpacePinningMutation } from '../hooks/pinning/useSpaceMutation';
import { useContent } from '../hooks/useContent';
import { useSpace } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const Space: FC = () => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();
    const {
        data: space,
        isInitialLoading,
        error,
    } = useSpace(projectUuid, spaceUuid);

    const { data: allItems, isLoading: isContentLoading } = useContent(
        {
            projectUuid,
            spaceUuids: [spaceUuid],
            pageSize: Number.MAX_SAFE_INTEGER,
        },
        {
            select: (d): ResourceViewItem[] =>
                contentToResourceViewItems(d.data),
        },
    );

    const [dashboards, charts] = useMemo(() => {
        if (allItems) {
            return [
                allItems.filter(
                    (item) => item.type === ResourceViewItemType.DASHBOARD,
                ),
                allItems.filter(
                    (item) => item.type === ResourceViewItemType.CHART,
                ),
            ];
        }

        return [[], []];
    }, [allItems]);
    const { mutate: pinSpace } = useSpacePinningMutation(projectUuid);
    const { user, health } = useApp();

    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const history = useHistory();
    const location = useLocation();

    const [updateSpace, setUpdateSpace] = useState<boolean>(false);
    const [deleteSpace, setDeleteSpace] = useState<boolean>(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);
    const [addToSpace, setAddToSpace] = useState<AddToSpaceResources>();
    const [createToSpace, setCreateToSpace] = useState<AddToSpaceResources>();

    const handlePinToggleSpace = useCallback(
        (spaceId: string) => pinSpace(spaceId),
        [pinSpace],
    );

    if (isInitialLoading || isContentLoading) {
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

    return (
        <Page title={space?.name} withFixedContent withPaddedContent>
            <Stack spacing="xl">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            {
                                title: 'Spaces',
                                to: `/projects/${projectUuid}/spaces`,
                            },
                            {
                                title: space.name,
                                active: true,
                            },
                        ]}
                    />

                    <Group spacing="xs">
                        {!isDemo &&
                            (userCanCreateDashboards ||
                                userCanCreateCharts) && (
                                <Menu
                                    position="bottom-end"
                                    shadow="md"
                                    closeOnItemClick
                                    withArrow
                                    arrowPosition="center"
                                >
                                    <Menu.Target>
                                        <Box>
                                            <ActionIcon
                                                size={36}
                                                color="blue"
                                                variant="filled"
                                            >
                                                <MantineIcon
                                                    icon={IconPlus}
                                                    size="lg"
                                                />
                                            </ActionIcon>
                                        </Box>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        {userCanCreateDashboards ? (
                                            <>
                                                <Menu.Label>
                                                    Add dashboard
                                                </Menu.Label>

                                                {dashboards.length > 0 ? (
                                                    <Menu.Item
                                                        icon={
                                                            <MantineIcon
                                                                icon={
                                                                    IconSquarePlus
                                                                }
                                                            />
                                                        }
                                                        onClick={() => {
                                                            setAddToSpace(
                                                                AddToSpaceResources.DASHBOARD,
                                                            );
                                                        }}
                                                    >
                                                        Add existing dashboard
                                                    </Menu.Item>
                                                ) : null}
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
                                            </>
                                        ) : null}

                                        {userCanCreateDashboards &&
                                            userCanCreateCharts && (
                                                <Menu.Divider />
                                            )}

                                        {userCanCreateCharts ? (
                                            <>
                                                <Menu.Label>
                                                    Add chart
                                                </Menu.Label>

                                                {charts.length > 0 ? (
                                                    <Menu.Item
                                                        icon={
                                                            <MantineIcon
                                                                icon={
                                                                    IconSquarePlus
                                                                }
                                                            />
                                                        }
                                                        onClick={() => {
                                                            setAddToSpace(
                                                                AddToSpaceResources.CHART,
                                                            );
                                                        }}
                                                    >
                                                        Add existing chart
                                                    </Menu.Item>
                                                ) : null}

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
                                            </>
                                        ) : null}
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                        <Can I="manage" this={subject('Space', space)}>
                            <ShareSpaceModal
                                space={space!}
                                projectUuid={projectUuid}
                            />
                            <SpaceBrowserMenu
                                onRename={() => setUpdateSpace(true)}
                                onDelete={() => setDeleteSpace(true)}
                                onTogglePin={() =>
                                    handlePinToggleSpace(space?.uuid)
                                }
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
                                />
                            )}
                            {deleteSpace && (
                                <SpaceActionModal
                                    projectUuid={projectUuid}
                                    spaceUuid={space?.uuid}
                                    actionType={ActionType.DELETE}
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
                                            history.push(
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
                <ResourceView
                    items={allItems || []}
                    listProps={{
                        defaultColumnVisibility: { space: false },
                    }}
                    tabs={[
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
                        {
                            id: 'all-items',
                            name: 'All items',
                        },
                    ]}
                    emptyStateProps={{
                        icon: <IconLayoutDashboard size={30} />,
                        title: 'No items added yet',
                    }}
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
                        history.push(
                            `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                        );

                        setIsCreateDashboardOpen(false);
                    }}
                />
            </Stack>
        </Page>
    );
};

export default Space;
