import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ChartSourceType,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import { ActionIcon, Box, Menu, Tooltip } from '@mantine/core';
import {
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconEdit,
    IconFolderSymlink,
    IconLayoutGridAdd,
    IconPin,
    IconPinnedOff,
    IconTrash,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useLocation, useParams } from 'react-router';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteChartDiffMutation,
    usePromoteMutation,
} from '../../../features/promotion/hooks/usePromoteChart';
import {
    usePromoteDashboardDiffMutation,
    usePromoteDashboardMutation,
} from '../../../features/promotion/hooks/usePromoteDashboard';
import { useProject } from '../../../hooks/useProject';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../MantineIcon';
import {
    ResourceViewItemAction,
    type ResourceViewItemActionState,
} from './types';

export interface ResourceViewActionMenuCommonProps {
    onAction: (newAction: ResourceViewItemActionState) => void;
}

interface ResourceViewActionMenuProps
    extends ResourceViewActionMenuCommonProps {
    disabled?: boolean;
    item: ResourceViewItem;
    allowDelete?: boolean;
    isOpen?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
}

const ResourceViewActionMenu: FC<ResourceViewActionMenuProps> = ({
    disabled = false,
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

    const { mutate: promoteChart } = usePromoteMutation();
    const { mutate: promoteDashboard } = usePromoteDashboardMutation();
    const {
        mutate: getPromoteDashboardDiff,
        data: promoteDashboardDiff,
        reset: resetPromoteDashboardDiff,
        isLoading: promoteDashboardDiffLoading,
    } = usePromoteDashboardDiffMutation();
    const {
        mutate: getPromoteChartDiff,
        data: promoteChartDiff,
        reset: resetPromoteChartDiff,
        isLoading: promoteChartDiffLoading,
    } = usePromoteChartDiffMutation();

    const userCanPromoteChart = user.data?.ability?.can(
        'promote',
        subject('SavedChart', {
            organizationUuid,
            projectUuid,
        }),
    );

    const isSqlChart =
        item.type === ResourceViewItemType.CHART &&
        item.data.source === ChartSourceType.SQL;

    switch (item.type) {
        case ResourceViewItemType.CHART: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.spaceUuid,
            )?.userAccess;

            if (
                isSqlChart &&
                user.data?.ability?.cannot(
                    'manage',
                    subject('SqlRunner', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid,
                        access: userAccess ? [userAccess] : [],
                    }),
                )
            ) {
                return null;
            }

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
        <>
            <Menu
                disabled={disabled}
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
                            disabled={disabled}
                            aria-label="Menu"
                            data-testid={`ResourceViewActionMenu/${item.data.name}`}
                            sx={(theme) => ({
                                ':hover': {
                                    backgroundColor: theme.colors.ldGray[1],
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
                        sx={isSqlChart ? { display: 'none' } : {}}
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
                            sx={isSqlChart ? { display: 'none' } : {}}
                        >
                            Duplicate
                        </Menu.Item>
                    ) : null}

                    {!isDashboardPage &&
                        item.type === ResourceViewItemType.CHART && (
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
                        !isSqlChart &&
                        item.type !== ResourceViewItemType.SPACE && (
                            <Tooltip
                                label="You must enable first an upstream project in settings > Data ops"
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
                                        onClick={() => {
                                            if (
                                                item.type ===
                                                ResourceViewItemType.CHART
                                            ) {
                                                getPromoteChartDiff(
                                                    item.data.uuid,
                                                );
                                            } else
                                                getPromoteDashboardDiff(
                                                    item.data.uuid,
                                                );
                                        }}
                                    >
                                        Promote{' '}
                                        {item.type ===
                                        ResourceViewItemType.CHART
                                            ? 'chart'
                                            : 'dashboard'}
                                    </Menu.Item>
                                </div>
                            </Tooltip>
                        )}

                    {user.data?.ability.can(
                        'manage',
                        subject('PinnedItems', {
                            organizationUuid,
                            projectUuid,
                        }),
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
                            sx={isSqlChart ? { display: 'none' } : {}}
                        >
                            {isPinned
                                ? 'Unpin from homepage'
                                : 'Pin to homepage'}
                        </Menu.Item>
                    ) : null}

                    <Menu.Divider display={isSqlChart ? 'none' : 'block'} />

                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={<IconFolderSymlink size={18} />}
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.TRANSFER_TO_SPACE,
                                item,
                            });
                        }}
                    >
                        Move
                    </Menu.Item>

                    {allowDelete && (
                        <>
                            <Menu.Divider />

                            <Menu.Item
                                component="button"
                                role="menuitem"
                                color="red"
                                icon={
                                    <MantineIcon icon={IconTrash} size={18} />
                                }
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

            {(promoteChartDiff || promoteChartDiffLoading) && (
                <PromotionConfirmDialog
                    type="chart"
                    promotionChanges={promoteChartDiff}
                    resourceName={item.data.name}
                    onClose={() => {
                        resetPromoteChartDiff();
                    }}
                    onConfirm={() => {
                        promoteChart(item.data.uuid);
                    }}
                ></PromotionConfirmDialog>
            )}
            {(promoteDashboardDiff || promoteDashboardDiffLoading) && (
                <PromotionConfirmDialog
                    type="dashboard"
                    resourceName={item.data.name}
                    promotionChanges={promoteDashboardDiff}
                    onClose={() => {
                        resetPromoteDashboardDiff();
                    }}
                    onConfirm={() => {
                        promoteDashboard(item.data.uuid);
                    }}
                ></PromotionConfirmDialog>
            )}
        </>
    );
};

export default ResourceViewActionMenu;
