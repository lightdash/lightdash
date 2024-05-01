import { subject } from '@casl/ability';
import {
    assertUnreachable,
    FeatureFlags,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import { ActionIcon, Box, Menu, Tooltip } from '@mantine/core';
import {
    IconCheck,
    IconChevronRight,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconEdit,
    IconFolders,
    IconLayoutGridAdd,
    IconPin,
    IconPinnedOff,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { Fragment, useMemo, type FC } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useProject } from '../../../hooks/useProject';
import { usePromoteMutation } from '../../../hooks/usePromoteChart';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../Authorization';
import MantineIcon from '../MantineIcon';
import {
    ResourceViewItemAction,
    type ResourceViewItemActionState,
} from './ResourceActionHandlers';

export interface ResourceViewActionMenuCommonProps {
    onAction: (newAction: ResourceViewItemActionState) => void;
}

interface ResourceViewActionMenuProps
    extends ResourceViewActionMenuCommonProps {
    item: ResourceViewItem;
    allowDelete?: boolean;
    isOpen?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
}

enum SpaceType {
    SharedWithMe,
    AdminContentView,
}

const SpaceTypeLabels = {
    [SpaceType.SharedWithMe]: 'Shared with me',
    [SpaceType.AdminContentView]: 'Public content view',
};

const ResourceViewActionMenu: FC<ResourceViewActionMenuProps> = ({
    item,
    allowDelete = true,
    isOpen,
    onOpen,
    onClose,
    onAction,
}) => {
    const { user } = useApp();
    const location = useLocation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const organizationUuid = user.data?.organizationUuid;
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const isPinned = !!item.data.pinnedListUuid;
    const isDashboardPage = location.pathname.includes('/dashboards');

    const spacesByType = useMemo(() => {
        const spacesUserCanCreateIn = spaces.filter((space) => {
            return user.data?.ability?.can(
                'create',
                subject('SavedChart', {
                    ...space,
                    access: space.userAccess ? [space.userAccess] : [],
                }),
            );
        });
        const spacesSharedWithMe = spacesUserCanCreateIn.filter((space) => {
            return user.data && space.userAccess?.hasDirectAccess;
        });
        const spacesAdminsCanSee = spacesUserCanCreateIn.filter((space) => {
            return (
                spacesSharedWithMe.find((s) => s.uuid === space.uuid) ===
                undefined
            );
        });
        return {
            [SpaceType.SharedWithMe]: spacesSharedWithMe,
            [SpaceType.AdminContentView]: spacesAdminsCanSee,
        };
    }, [spaces, user.data]);

    const { mutate: promoteChart } = usePromoteMutation();
    const isPromoteChartsEnabled = useFeatureFlagEnabled(
        FeatureFlags.PromoteCharts,
    );

    const userCanPromoteChart =
        isPromoteChartsEnabled &&
        user.data?.ability?.can(
            'promote',
            subject('SavedChart', {
                organizationUuid,
                projectUuid,
            }),
        );

    switch (item.type) {
        case ResourceViewItemType.CHART: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.spaceUuid,
            )?.userAccess;
            if (
                user.data?.ability?.cannot(
                    'manage',
                    subject('SavedChart', {
                        ...item.data,
                        access: userAccess ? [userAccess] : [],
                    }),
                )
            ) {
                return null;
            }
            break;
        }
        case ResourceViewItemType.DASHBOARD: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.spaceUuid,
            )?.userAccess;
            if (
                user.data?.ability?.cannot(
                    'manage',
                    subject('Dashboard', {
                        ...item.data,
                        access: userAccess ? [userAccess] : [],
                    }),
                )
            ) {
                return null;
            }
            break;
        }
        case ResourceViewItemType.SPACE: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.uuid,
            )?.userAccess;
            if (
                user.data?.ability?.cannot(
                    'manage',
                    subject('Space', {
                        ...item.data,
                        access: userAccess ? [userAccess] : [],
                    }),
                )
            ) {
                return null;
            }
            break;
        }
        default:
            return assertUnreachable(item, 'Resource type not supported');
    }

    return (
        <Menu
            withinPortal
            opened={isOpen}
            position="bottom-start"
            withArrow
            arrowPosition="center"
            shadow="md"
            offset={-4}
            closeOnItemClick
            closeOnClickOutside
            onClose={onClose}
        >
            <Menu.Target>
                <Box onClick={isOpen ? onClose : onOpen}>
                    <ActionIcon
                        aria-label="Menu"
                        sx={(theme) => ({
                            ':hover': {
                                backgroundColor: theme.colors.gray[1],
                            },
                        })}
                    >
                        <IconDots size={16} />
                    </ActionIcon>
                </Box>
            </Menu.Target>

            <Menu.Dropdown maw={320}>
                <Menu.Item
                    component="button"
                    role="menuitem"
                    icon={<IconEdit size={18} />}
                    onClick={() => {
                        onAction({
                            type: ResourceViewItemAction.UPDATE,
                            item,
                        });
                    }}
                >
                    Rename
                </Menu.Item>

                {item.type === ResourceViewItemType.CHART ||
                item.type === ResourceViewItemType.DASHBOARD ? (
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={<IconCopy size={18} />}
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.DUPLICATE,
                                item,
                            });
                        }}
                    >
                        Duplicate
                    </Menu.Item>
                ) : null}

                {!isDashboardPage && item.type === ResourceViewItemType.CHART && (
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={<IconLayoutGridAdd size={18} />}
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.ADD_TO_DASHBOARD,
                                item,
                            });
                        }}
                    >
                        Add to Dashboard
                    </Menu.Item>
                )}
                {userCanPromoteChart &&
                    item.type === ResourceViewItemType.CHART && (
                        <Tooltip
                            label="You must enable first an upstram project in settings > Data ops"
                            disabled={
                                project?.upstreamProjectUuid !== undefined
                            }
                            withinPortal
                        >
                            <div>
                                <Menu.Item
                                    disabled={
                                        project?.upstreamProjectUuid ===
                                        undefined
                                    }
                                    icon={
                                        <MantineIcon
                                            icon={IconDatabaseExport}
                                        />
                                    }
                                    onClick={() => promoteChart(item.data.uuid)}
                                >
                                    Promote chart
                                </Menu.Item>
                            </div>
                        </Tooltip>
                    )}

                {user.data?.ability.can(
                    'manage',
                    subject('PinnedItems', { organizationUuid, projectUuid }),
                ) ? (
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={
                            isPinned ? (
                                <IconPinnedOff size={18} />
                            ) : (
                                <IconPin size={18} />
                            )
                        }
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.PIN_TO_HOMEPAGE,
                                item,
                            });
                        }}
                    >
                        {isPinned ? 'Unpin from homepage' : 'Pin to homepage'}
                    </Menu.Item>
                ) : null}

                {item.type === ResourceViewItemType.CHART ||
                item.type === ResourceViewItemType.DASHBOARD ? (
                    <>
                        <Menu.Divider />

                        <Menu
                            withinPortal
                            trigger="hover"
                            offset={0}
                            position="right"
                            shadow="md"
                            closeOnItemClick
                        >
                            <Menu.Target>
                                <Menu.Item
                                    component="button"
                                    role="menuitem"
                                    icon={<IconFolders size={18} />}
                                    rightSection={
                                        <Box w={18} h={18} ml="lg">
                                            <IconChevronRight size={18} />
                                        </Box>
                                    }
                                >
                                    Move to Space
                                </Menu.Item>
                            </Menu.Target>

                            <Menu.Dropdown
                                maw={320}
                                mah={400}
                                style={{
                                    overflowY: 'auto',
                                }}
                            >
                                {[
                                    SpaceType.SharedWithMe,
                                    SpaceType.AdminContentView,
                                ].map((spaceType) => (
                                    <Fragment key={spaceType}>
                                        {spacesByType[spaceType].length > 0 ? (
                                            <>
                                                {spaceType ===
                                                    SpaceType.AdminContentView &&
                                                spacesByType[
                                                    SpaceType.SharedWithMe
                                                ].length > 0 ? (
                                                    <Menu.Divider />
                                                ) : null}

                                                <Menu.Label>
                                                    {SpaceTypeLabels[spaceType]}
                                                </Menu.Label>
                                            </>
                                        ) : null}

                                        {spacesByType[spaceType].map(
                                            (space) => (
                                                <Menu.Item
                                                    key={space.uuid}
                                                    role="menuitem"
                                                    disabled={
                                                        item.data.spaceUuid ===
                                                        space.uuid
                                                    }
                                                    icon={
                                                        item.data.spaceUuid ===
                                                        space.uuid ? (
                                                            <IconCheck
                                                                size={18}
                                                            />
                                                        ) : (
                                                            <Box
                                                                w={18}
                                                                h={18}
                                                            />
                                                        )
                                                    }
                                                    component="button"
                                                    onClick={() => {
                                                        if (
                                                            item.data
                                                                .spaceUuid !==
                                                            space.uuid
                                                        ) {
                                                            onAction({
                                                                type: ResourceViewItemAction.MOVE_TO_SPACE,
                                                                item,
                                                                data: {
                                                                    ...item.data,
                                                                    spaceUuid:
                                                                        space.uuid,
                                                                },
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {space.name}
                                                </Menu.Item>
                                            ),
                                        )}
                                    </Fragment>
                                ))}

                                <Can
                                    I="create"
                                    this={subject('Space', {
                                        organizationUuid:
                                            user.data?.organizationUuid,
                                        projectUuid,
                                    })}
                                >
                                    {spaces.length > 0 ? (
                                        <Menu.Divider />
                                    ) : null}
                                    <Menu.Item
                                        component="button"
                                        role="menuitem"
                                        icon={
                                            <MantineIcon
                                                icon={IconPlus}
                                                size={18}
                                            />
                                        }
                                        onClick={() => {
                                            onAction({
                                                type: ResourceViewItemAction.CREATE_SPACE,
                                                item,
                                            });
                                        }}
                                    >
                                        Create new space
                                    </Menu.Item>
                                </Can>
                            </Menu.Dropdown>
                        </Menu>
                    </>
                ) : null}

                {allowDelete && (
                    <>
                        <Menu.Divider />

                        <Menu.Item
                            component="button"
                            role="menuitem"
                            color="red"
                            icon={<MantineIcon icon={IconTrash} size={18} />}
                            onClick={() => {
                                onAction({
                                    type: ResourceViewItemAction.DELETE,
                                    item,
                                });
                            }}
                        >
                            Delete {item.type}
                        </Menu.Item>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default ResourceViewActionMenu;
