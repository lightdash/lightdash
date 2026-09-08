import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ChartSourceType,
    ContentReviewContentType,
    DirectAccessResourceType,
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    ResourceViewItemType,
    type ResourceViewItem,
    type SpaceMemberRole,
    type SpaceSummary,
} from '@lightdash/common';
import { ActionIcon, Box, Menu } from '@mantine/core';
import { IconCopy, IconDots } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContentReviewEligibility } from '../../../ee/features/contentReview';
import { FavoritePersonalDataAppModal } from '../../../features/apps/components/FavoritePersonalDataAppModal';
import { PromoteAppModal } from '../../../features/apps/components/PromoteAppModal';
import { useDuplicateApp } from '../../../features/apps/hooks/useDuplicateApp';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../../../features/directAccess';
import { PromotionConfirmDialog } from '../../../features/promotion/components/PromotionConfirmDialog';
import {
    usePromoteChartDiffMutation,
    usePromoteMutation,
} from '../../../features/promotion/hooks/usePromoteChart';
import {
    usePromoteDashboardDiffMutation,
    usePromoteDashboardMutation,
} from '../../../features/promotion/hooks/usePromoteDashboard';
import {
    useUnverifyChartMutation,
    useUnverifyDashboardMutation,
    useVerifyChartMutation,
    useVerifyDashboardMutation,
} from '../../../hooks/useContentVerification';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import useFavoritesContext from '../../../providers/Favorites/useFavoritesContext';
import MantineIcon from '../MantineIcon';
import { ResourceActionMenuItems } from './ResourceActionMenuItems';
import { type ResourceViewItemActionState } from './types';

export interface ResourceViewActionMenuCommonProps {
    onAction: (newAction: ResourceViewItemActionState) => void;
}

interface ResourceViewActionMenuProps extends ResourceViewActionMenuCommonProps {
    disabled?: boolean;
    item: ResourceViewItem;
    /** Roles the viewer holds on this item through direct grants. */
    grantRoles?: SpaceMemberRole[];
    allowDelete?: boolean;
    hideVerification?: boolean;
    isOpen?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
}

const getResourceUserCanManage = (
    item: ResourceViewItem,
    {
        isSqlChart,
        spaces,
        grantAccess,
        user,
        organizationUuid,
        projectUuid,
    }: {
        isSqlChart: boolean;
        spaces: SpaceSummary[];
        grantAccess: Array<{ userUuid: string; role: SpaceMemberRole }>;
        user: ReturnType<typeof useApp>['user'];
        organizationUuid: string | undefined;
        projectUuid: string | undefined;
    },
): boolean => {
    switch (item.type) {
        case ResourceViewItemType.CHART: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.spaceUuid,
            )?.userAccess;

            if (isSqlChart) {
                return (
                    user.data?.ability?.can(
                        'manage',
                        subject('SqlRunner', {
                            organizationUuid,
                            projectUuid,
                            access: [
                                ...(userAccess ? [userAccess] : []),
                                ...grantAccess,
                            ],
                        }),
                    ) === true &&
                    user.data?.ability?.can(
                        'manage',
                        subject('SavedChart', {
                            ...item.data,
                            projectUuid,
                            organizationUuid,
                            access: [
                                ...(userAccess ? [userAccess] : []),
                                ...grantAccess,
                            ],
                        }),
                    ) === true
                );
            }

            return (
                user.data?.ability?.can(
                    'manage',
                    subject('SavedChart', {
                        ...item.data,
                        projectUuid,
                        organizationUuid,
                        access: [
                            ...(userAccess ? [userAccess] : []),
                            ...grantAccess,
                        ],
                    }),
                ) === true
            );
        }
        case ResourceViewItemType.DASHBOARD: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.spaceUuid,
            )?.userAccess;
            return (
                user.data?.ability?.can(
                    'manage',
                    subject('Dashboard', {
                        ...item.data,
                        projectUuid,
                        organizationUuid,
                        access: [
                            ...(userAccess ? [userAccess] : []),
                            ...grantAccess,
                        ],
                    }),
                ) === true
            );
        }
        case ResourceViewItemType.SPACE: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.uuid,
            )?.userAccess;
            return (
                user.data?.ability?.can(
                    'manage',
                    subject('Space', {
                        ...item.data,
                        projectUuid,
                        organizationUuid,
                        access: userAccess ? [userAccess] : [],
                    }),
                ) === true
            );
        }
        case ResourceViewItemType.DATA_APP: {
            const userAccess = spaces.find(
                (space) => space.uuid === item.data.spaceUuid,
            )?.userAccess;
            return (
                user.data?.ability?.can(
                    'manage',
                    subject('DataApp', {
                        organizationUuid,
                        projectUuid,
                        access: [
                            ...(userAccess ? [userAccess] : []),
                            ...grantAccess,
                        ],
                        createdByUserUuid: item.data.createdByUserUuid,
                    }),
                ) === true
            );
        }
        default:
            return assertUnreachable(item, 'Resource type not supported');
    }
};

const ResourceViewActionMenu: FC<ResourceViewActionMenuProps> = ({
    disabled = false,
    item,
    grantRoles = [],
    allowDelete = true,
    hideVerification = false,
    isOpen,
    onOpen,
    onClose,
    onAction,
}) => {
    const { user } = useApp();
    const location = useLocation();
    const navigate = useNavigate();
    const projectUuid = useProjectUuid();
    const { data: project } = useProject(projectUuid);
    const [isPromoteAppOpen, setIsPromoteAppOpen] = useState(false);
    const [isManageAccessOpen, setIsManageAccessOpen] = useState(false);
    const directAccessAvailability = useDirectAccessAvailability();
    const [isFavoriteSpaceModalOpen, setIsFavoriteSpaceModalOpen] =
        useState(false);
    const { mutate: duplicateApp } = useDuplicateApp();
    const organizationUuid = user.data?.organizationUuid;
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    // Direct grants are the second path to a resource: without them the
    // per-type checks below see an empty access list and hide every action.
    const grantAccess = user.data?.userUuid
        ? grantRoles.map((role) => ({ userUuid: user.data!.userUuid, role }))
        : [];
    const canManageAccess = useCanManageDirectAccess({
        projectUuid,
        spaceUuid:
            item.type === ResourceViewItemType.SPACE
                ? null
                : (item.data.spaceUuid ?? null),
        createdByUserUuid:
            item.type === ResourceViewItemType.DATA_APP
                ? item.data.createdByUserUuid
                : null,
        access: [],
        grantRoles,
    });
    const isPinned = !!item.data.pinnedListUuid;
    const isDashboardPage = location.pathname.includes('/dashboards');

    const isChartOrDashboard =
        isResourceViewItemChart(item) || isResourceViewItemDashboard(item);
    const isVerified = isChartOrDashboard && item.data.verification !== null;
    const userCanManageVerification =
        user.data?.ability?.can(
            'manage',
            subject('ContentVerification', {
                organizationUuid,
                projectUuid,
            }),
        ) === true;

    const { mutate: verifyChart } = useVerifyChartMutation();
    const { mutate: unverifyChart } = useUnverifyChartMutation();
    const { mutate: verifyDashboard } = useVerifyDashboardMutation();
    const { mutate: unverifyDashboard } = useUnverifyDashboardMutation();

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

    // Mirror the backend promote check: promoting also requires promote
    // rights on the upstream (destination) project, so hide the action when
    // an upstream exists but the user has no promote access there.
    const promoteSubjectName =
        item.type === ResourceViewItemType.CHART ? 'SavedChart' : 'Dashboard';
    const promoteItemAccess = isChartOrDashboard
        ? (() => {
              const userAccess = spaces.find(
                  (space) => space.uuid === item.data.spaceUuid,
              )?.userAccess;
              return userAccess ? [userAccess] : [];
          })()
        : [];
    const userCanPromoteChart =
        user.data?.ability?.can(
            'promote',
            subject(promoteSubjectName, {
                organizationUuid,
                projectUuid,
                access: promoteItemAccess,
            }),
        ) &&
        (project?.upstreamProjectUuid === undefined ||
            user.data?.ability?.can(
                'promote',
                subject(promoteSubjectName, {
                    organizationUuid,
                    projectUuid: project.upstreamProjectUuid,
                    access: promoteItemAccess,
                }),
            ));

    const isSqlChart =
        item.type === ResourceViewItemType.CHART &&
        item.data.source === ChartSourceType.SQL;
    const contentReview = useContentReviewEligibility({
        projectUuid,
        contentType: isResourceViewItemDashboard(item)
            ? ContentReviewContentType.DASHBOARD
            : isSqlChart
              ? ContentReviewContentType.SQL_CHART
              : ContentReviewContentType.CHART,
        contentUuid: isChartOrDashboard ? item.data.uuid : undefined,
        spaceUuid: isChartOrDashboard ? item.data.spaceUuid : null,
    });

    // Personal (space-less) data apps can't be pinned — the backend rejects it.
    const isPersonalDataApp =
        item.type === ResourceViewItemType.DATA_APP && !item.data.spaceUuid;

    // Match the app builder's wording: apps not yet in a space are "added",
    // apps already in one are "moved".
    const moveActionLabel =
        item.type === ResourceViewItemType.DATA_APP
            ? isPersonalDataApp
                ? 'Add to space'
                : 'Move to space'
            : 'Move';

    const directAccessResourceType =
        item.type === ResourceViewItemType.DASHBOARD
            ? DirectAccessResourceType.DASHBOARD
            : item.type === ResourceViewItemType.CHART
              ? isSqlChart
                  ? DirectAccessResourceType.SQL_CHART
                  : DirectAccessResourceType.CHART
              : item.type === ResourceViewItemType.DATA_APP
                ? DirectAccessResourceType.APP
                : null;

    const favoritesContext = useFavoritesContext();
    const isFavorited = favoritesContext?.isFavorited(item.data.uuid) ?? false;

    const userCanManage = getResourceUserCanManage(item, {
        isSqlChart,
        spaces,
        grantAccess,
        user,
        organizationUuid,
        projectUuid,
    });

    // Duplicating a data app forks it into the user's own personal app, so the
    // backend only asks for view access plus `create:DataApp` — not manage
    // rights on the source app.
    const canDuplicateDataApp =
        item.type === ResourceViewItemType.DATA_APP &&
        user.data?.ability?.can(
            'create',
            subject('DataApp', {
                organizationUuid,
                projectUuid,
            }),
        ) === true;

    if (!userCanManage && !canDuplicateDataApp && !favoritesContext) {
        return null;
    }

    const canManagePinnedItems = !!user.data?.ability.can(
        'manage',
        subject('PinnedItems', {
            organizationUuid,
            projectUuid,
        }),
    );

    // Apps duplicate synchronously via a direct mutation; charts and dashboards
    // open a modal that lets the user pick a name/space first.
    const duplicateDataAppMenuItem = (
        <Menu.Item
            component="button"
            role="menuitem"
            leftSection={<MantineIcon icon={IconCopy} size={18} />}
            onClick={() => {
                if (!projectUuid) return;
                duplicateApp(
                    { projectUuid, appUuid: item.data.uuid },
                    {
                        onSuccess: ({ appUuid: newAppUuid }) => {
                            void navigate(
                                `/projects/${projectUuid}/apps/${newAppUuid}`,
                            );
                        },
                    },
                );
            }}
        >
            Duplicate
        </Menu.Item>
    );

    return (
        <>
            <Menu
                disabled={disabled}
                opened={isOpen}
                returnFocus={!isManageAccessOpen}
                position="bottom-start"
                withArrow
                arrowPosition="center"
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
                            // Anchor for scope walkthroughs (data-tour-via)
                            data-tour-anchor="resource-actions"
                            data-tour-hint="Open the actions menu on a space"
                        >
                            <IconDots size={16} />
                        </ActionIcon>
                    </Box>
                </Menu.Target>

                <Menu.Dropdown maw={320}>
                    <ResourceActionMenuItems
                        item={item}
                        projectUuid={projectUuid}
                        project={project}
                        favoritesContext={favoritesContext}
                        isFavorited={isFavorited}
                        isPersonalDataApp={isPersonalDataApp}
                        isChartOrDashboard={isChartOrDashboard}
                        isSqlChart={isSqlChart}
                        isDashboardPage={isDashboardPage}
                        isPinned={isPinned}
                        isVerified={isVerified}
                        userCanManage={userCanManage}
                        canDuplicateDataApp={canDuplicateDataApp}
                        userCanPromoteChart={userCanPromoteChart}
                        userCanManageVerification={userCanManageVerification}
                        canManagePinnedItems={canManagePinnedItems}
                        canRequestReview={contentReview.canRequest}
                        hideVerification={hideVerification}
                        allowDelete={allowDelete}
                        isDirectAccessAvailable={
                            directAccessAvailability.isAvailable
                        }
                        canManageAccess={canManageAccess}
                        directAccessResourceType={directAccessResourceType}
                        moveActionLabel={moveActionLabel}
                        duplicateDataAppMenuItem={duplicateDataAppMenuItem}
                        navigate={navigate}
                        onAction={onAction}
                        onOpenFavoriteSpaceModal={() =>
                            setIsFavoriteSpaceModalOpen(true)
                        }
                        onOpenPromoteApp={() => setIsPromoteAppOpen(true)}
                        onPromoteChart={getPromoteChartDiff}
                        onPromoteDashboard={getPromoteDashboardDiff}
                        onUnverifyChart={unverifyChart}
                        onUnverifyDashboard={unverifyDashboard}
                        onVerifyChart={verifyChart}
                        onVerifyDashboard={verifyDashboard}
                        onOpenManageAccess={() => setIsManageAccessOpen(true)}
                    />
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
            {isPromoteAppOpen &&
                projectUuid &&
                item.type === ResourceViewItemType.DATA_APP && (
                    <PromoteAppModal
                        projectUuid={projectUuid}
                        appUuid={item.data.uuid}
                        opened
                        onClose={() => setIsPromoteAppOpen(false)}
                    />
                )}
            {isManageAccessOpen &&
                projectUuid &&
                directAccessResourceType !== null && (
                    <DirectAccessModal
                        opened
                        onClose={() => setIsManageAccessOpen(false)}
                        projectUuid={projectUuid}
                        resource={{
                            resourceType: directAccessResourceType,
                            resourceUuid: item.data.uuid,
                            name: item.data.name,
                        }}
                    />
                )}
            {isFavoriteSpaceModalOpen &&
                projectUuid &&
                item.type === ResourceViewItemType.DATA_APP && (
                    <FavoritePersonalDataAppModal
                        projectUuid={projectUuid}
                        app={item.data}
                        opened
                        onClose={() => setIsFavoriteSpaceModalOpen(false)}
                    />
                )}
        </>
    );
};

export default ResourceViewActionMenu;
