import {
    assertUnreachable,
    isResourceViewDataAppItem,
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    ResourceViewItemType,
    type DirectAccessResourceType,
    type Project,
    type ResourceViewItem,
} from '@lightdash/common';
import { Menu, Tooltip } from '@mantine/core';
import {
    IconCircleCheck,
    IconCircleCheckFilled,
    IconCode,
    IconCopy,
    IconDatabaseExport,
    IconEdit,
    IconFolderPlus,
    IconFolderSymlink,
    IconLayoutGridAdd,
    IconPin,
    IconPinnedOff,
    IconSend,
    IconStar,
    IconStarFilled,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type NavigateFunction } from 'react-router';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import { type FavoritesContextType } from '../../../providers/Favorites/context';
import MantineIcon from '../MantineIcon';
import {
    ResourceViewItemAction,
    type ResourceViewItemActionState,
} from './types';

type ResourceActionMenuItemsProps = {
    item: ResourceViewItem;
    projectUuid: string | undefined;
    project: Project | undefined;
    favoritesContext: FavoritesContextType | null;
    isFavorited: boolean;
    isPersonalDataApp: boolean;
    isChartOrDashboard: boolean;
    authoringEnabled: boolean;
    isSqlChart: boolean;
    isDashboardPage: boolean;
    isPinned: boolean;
    isVerified: boolean;
    userCanManage: boolean;
    canDuplicateDataApp: boolean;
    userCanPromoteChart: boolean | undefined;
    userCanManageVerification: boolean;
    canManagePinnedItems: boolean;
    canRequestReview: boolean;
    hideVerification: boolean;
    allowDelete: boolean;
    userCanDelete: boolean;
    isDirectAccessAvailable: boolean;
    canManageAccess: boolean;
    directAccessResourceType: DirectAccessResourceType | null;
    moveActionLabel: string;
    duplicateDataAppMenuItem: ReactNode;
    navigate: NavigateFunction;
    onAction: (newAction: ResourceViewItemActionState) => void;
    onOpenFavoriteSpaceModal: () => void;
    onOpenPromoteApp: () => void;
    onPromoteChart: (uuid: string) => void;
    onPromoteDashboard: (uuid: string) => void;
    onUnverifyChart: (uuid: string) => void;
    onUnverifyDashboard: (uuid: string) => void;
    onUnverifyDataApp: (uuid: string) => void;
    onVerifyChart: (uuid: string) => void;
    onVerifyDashboard: (uuid: string) => void;
    onVerifyDataApp: (uuid: string) => void;
    onOpenManageAccess: () => void;
};

const getDeleteLabel = (
    t: TFunction<'resourceView'>,
    type: ResourceViewItemType,
): string => {
    switch (type) {
        case ResourceViewItemType.CHART:
            return t('actionMenu.deleteChart');
        case ResourceViewItemType.DASHBOARD:
            return t('actionMenu.deleteDashboard');
        case ResourceViewItemType.SPACE:
            return t('actionMenu.deleteSpace');
        case ResourceViewItemType.DATA_APP:
            return t('actionMenu.deleteDataApp');
        case ResourceViewItemType.DOCUMENT:
            return t('actionMenu.deleteDocument');
        default:
            return assertUnreachable(type, 'Unknown resource type');
    }
};

export const ResourceActionMenuItems: FC<ResourceActionMenuItemsProps> = ({
    item,
    projectUuid,
    project,
    favoritesContext,
    isFavorited,
    isPersonalDataApp,
    isChartOrDashboard,
    authoringEnabled,
    isSqlChart,
    isDashboardPage,
    isPinned,
    isVerified,
    userCanManage,
    canDuplicateDataApp,
    userCanPromoteChart,
    userCanManageVerification,
    canManagePinnedItems,
    canRequestReview,
    hideVerification,
    allowDelete,
    userCanDelete,
    isDirectAccessAvailable,
    canManageAccess,
    directAccessResourceType,
    moveActionLabel,
    duplicateDataAppMenuItem,
    navigate,
    onAction,
    onOpenFavoriteSpaceModal,
    onOpenPromoteApp,
    onPromoteChart,
    onPromoteDashboard,
    onUnverifyChart,
    onUnverifyDashboard,
    onUnverifyDataApp,
    onVerifyChart,
    onVerifyDashboard,
    onVerifyDataApp,
    onOpenManageAccess,
}) => {
    const { t } = useTranslation('resourceView');
    return (
        <>
            {favoritesContext && (
                <Menu.Item
                    component="button"
                    role="menuitem"
                    leftSection={
                        isFavorited ? (
                            <IconStarFilled size={18} color="orange" />
                        ) : (
                            <IconStar size={18} />
                        )
                    }
                    onClick={() => {
                        // Space-less apps can't be favorited — offer
                        // the same move-to-space flow as the app header
                        if (isPersonalDataApp && !isFavorited) {
                            onOpenFavoriteSpaceModal();
                            return;
                        }
                        favoritesContext.toggleFavorite(
                            item.type,
                            item.data.uuid,
                        );
                    }}
                >
                    {isFavorited
                        ? t('actionMenu.removeFromFavorites')
                        : t('actionMenu.addToFavorites')}
                </Menu.Item>
            )}

            {isChartOrDashboard && !isSqlChart && (
                <>
                    <AskAiAgentMenuItem
                        projectUuid={projectUuid}
                        chartUuid={
                            isResourceViewItemChart(item)
                                ? item.data.uuid
                                : undefined
                        }
                        dashboardUuid={
                            isResourceViewItemDashboard(item)
                                ? item.data.uuid
                                : undefined
                        }
                        clickedFrom="resource_action_menu"
                    />
                    {/* TODO: add a create-issue entry point once the issues flow is finalized */}
                </>
            )}

            {isResourceViewDataAppItem(item) && (
                <AskAiAgentMenuItem
                    projectUuid={projectUuid}
                    dataAppUuid={item.data.uuid}
                    clickedFrom="data_app_resource_action_menu"
                />
            )}

            {(userCanManage || canDuplicateDataApp) && favoritesContext && (
                <Menu.Divider />
            )}

            {/* A user who can't manage the app can still fork it. */}
            {!userCanManage && canDuplicateDataApp && duplicateDataAppMenuItem}

            {userCanManage && (
                <>
                    {item.type === ResourceViewItemType.DATA_APP && (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            leftSection={
                                <MantineIcon icon={IconCode} size={18} />
                            }
                            onClick={() => {
                                if (!projectUuid) return;
                                void navigate(
                                    `/projects/${projectUuid}/apps/${item.data.uuid}`,
                                );
                            }}
                        >
                            {t('actionMenu.continueBuilding')}
                        </Menu.Item>
                    )}

                    <Menu.Item
                        display={
                            isChartOrDashboard && !authoringEnabled
                                ? 'none'
                                : undefined
                        }
                        component="button"
                        role="menuitem"
                        leftSection={<IconEdit size={18} />}
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.UPDATE,
                                item,
                            });
                        }}
                        style={isSqlChart ? { display: 'none' } : {}}
                    >
                        {item.type === ResourceViewItemType.SPACE
                            ? t('actionMenu.updateSpace')
                            : t('actionMenu.rename')}
                    </Menu.Item>

                    {canDuplicateDataApp ? duplicateDataAppMenuItem : null}
                    {item.type === ResourceViewItemType.CHART ||
                    item.type === ResourceViewItemType.DASHBOARD ? (
                        <Menu.Item
                            display={authoringEnabled ? undefined : 'none'}
                            component="button"
                            role="menuitem"
                            leftSection={
                                <MantineIcon icon={IconCopy} size={18} />
                            }
                            onClick={() => {
                                onAction({
                                    type: ResourceViewItemAction.DUPLICATE,
                                    item,
                                });
                            }}
                            style={isSqlChart ? { display: 'none' } : {}}
                        >
                            {t('actionMenu.duplicate')}
                        </Menu.Item>
                    ) : null}

                    {!isDashboardPage &&
                        item.type === ResourceViewItemType.CHART && (
                            <Menu.Item
                                component="button"
                                role="menuitem"
                                leftSection={<IconLayoutGridAdd size={18} />}
                                onClick={() => {
                                    onAction({
                                        type: ResourceViewItemAction.ADD_TO_DASHBOARD,
                                        item,
                                    });
                                }}
                            >
                                {t('actionMenu.addToDashboard')}
                            </Menu.Item>
                        )}
                    {userCanPromoteChart &&
                        !isSqlChart &&
                        item.type !== ResourceViewItemType.SPACE &&
                        item.type !== ResourceViewItemType.DATA_APP && (
                            <Tooltip
                                label={t('actionMenu.promoteRequiresUpstream')}
                                disabled={
                                    project?.upstreamProjectUuid !== undefined
                                }
                            >
                                <div>
                                    <Menu.Item
                                        disabled={
                                            project?.upstreamProjectUuid ===
                                            undefined
                                        }
                                        leftSection={
                                            <MantineIcon
                                                icon={IconDatabaseExport}
                                            />
                                        }
                                        onClick={() => {
                                            if (
                                                item.type ===
                                                ResourceViewItemType.CHART
                                            ) {
                                                onPromoteChart(item.data.uuid);
                                            } else
                                                onPromoteDashboard(
                                                    item.data.uuid,
                                                );
                                        }}
                                    >
                                        {item.type ===
                                        ResourceViewItemType.CHART
                                            ? t('actionMenu.promoteChart')
                                            : t('actionMenu.promoteDashboard')}
                                    </Menu.Item>
                                </div>
                            </Tooltip>
                        )}
                    {item.type === ResourceViewItemType.DATA_APP &&
                        project?.upstreamProjectUuid !== undefined && (
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconDatabaseExport} />
                                }
                                onClick={() => onOpenPromoteApp()}
                            >
                                {t('actionMenu.promoteDataApp')}
                            </Menu.Item>
                        )}

                    {canManagePinnedItems ? (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            // Scope-tour marker, beside the
                            // manage:PinnedItems check. See
                            // scripts/scope-tours/generate.ts.
                            data-tour-scope="manage:PinnedItems"
                            data-tour-step="2"
                            data-tour-route="/projects/:projectUuid/spaces"
                            data-tour-label="Click Pin to homepage"
                            data-tour-title="Pin content to the homepage"
                            data-tour-interactive="true"
                            data-tour-docs="explore/homepage.mdx#pin-content:2"
                            data-tour-via='[data-tour-nav="browse"] >> [data-tour-nav="all-spaces"] >> [data-tour-anchor="resource-actions"]'
                            leftSection={
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
                            style={
                                isSqlChart || isPersonalDataApp
                                    ? { display: 'none' }
                                    : {}
                            }
                        >
                            {isPinned
                                ? t('actionMenu.unpinFromHomepage')
                                : t('actionMenu.pinToHomepage')}
                        </Menu.Item>
                    ) : null}

                    {userCanManageVerification &&
                        (isChartOrDashboard ||
                            item.type === ResourceViewItemType.DATA_APP) &&
                        !hideVerification && (
                            <Menu.Item
                                component="button"
                                role="menuitem"
                                leftSection={
                                    isVerified ? (
                                        <IconCircleCheckFilled
                                            size={18}
                                            color="var(--mantine-color-green-6)"
                                        />
                                    ) : (
                                        <IconCircleCheck size={18} />
                                    )
                                }
                                onClick={() => {
                                    if (isVerified) {
                                        if (isResourceViewItemChart(item)) {
                                            onUnverifyChart(item.data.uuid);
                                        } else if (
                                            isResourceViewItemDashboard(item)
                                        ) {
                                            onUnverifyDashboard(item.data.uuid);
                                        } else if (
                                            isResourceViewDataAppItem(item)
                                        ) {
                                            onUnverifyDataApp(item.data.uuid);
                                        }
                                    } else if (isResourceViewItemChart(item)) {
                                        onVerifyChart(item.data.uuid);
                                    } else if (
                                        isResourceViewItemDashboard(item)
                                    ) {
                                        onVerifyDashboard(item.data.uuid);
                                    } else if (
                                        isResourceViewDataAppItem(item)
                                    ) {
                                        onVerifyDataApp(item.data.uuid);
                                    }
                                }}
                            >
                                {isVerified
                                    ? t('actionMenu.removeVerification')
                                    : t('actionMenu.verify')}
                            </Menu.Item>
                        )}

                    {canRequestReview && isChartOrDashboard && (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            leftSection={<MantineIcon icon={IconSend} />}
                            onClick={() => {
                                if (
                                    isResourceViewItemChart(item) ||
                                    isResourceViewItemDashboard(item)
                                ) {
                                    onAction({
                                        type: ResourceViewItemAction.REQUEST_REVIEW,
                                        item,
                                    });
                                }
                            }}
                        >
                            {t('actionMenu.requestReview')}
                        </Menu.Item>
                    )}

                    <Menu.Divider display={isSqlChart ? 'none' : 'block'} />

                    <Menu.Item
                        component="button"
                        role="menuitem"
                        leftSection={
                            isPersonalDataApp ? (
                                <IconFolderPlus size={18} />
                            ) : (
                                <IconFolderSymlink size={18} />
                            )
                        }
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.TRANSFER_TO_SPACE,
                                item,
                            });
                        }}
                    >
                        {moveActionLabel}
                    </Menu.Item>

                    {isDirectAccessAvailable &&
                        directAccessResourceType !== null &&
                        canManageAccess && (
                            <Menu.Item
                                component="button"
                                role="menuitem"
                                leftSection={
                                    <MantineIcon icon={IconUsers} size={18} />
                                }
                                onClick={() => {
                                    onOpenManageAccess();
                                }}
                            >
                                {t('actionMenu.share')}
                            </Menu.Item>
                        )}

                    {item.type === ResourceViewItemType.SPACE && (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            leftSection={<IconUsers size={18} />}
                            onClick={() => {
                                onAction({
                                    type: ResourceViewItemAction.SHARE,
                                    item,
                                });
                            }}
                        >
                            {t('actionMenu.share')}
                        </Menu.Item>
                    )}

                    {allowDelete &&
                        (item.type !== ResourceViewItemType.DASHBOARD ||
                            userCanDelete) && (
                            <>
                                <Menu.Divider />

                                <Menu.Item
                                    component="button"
                                    role="menuitem"
                                    color="red"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconTrash}
                                            size={18}
                                        />
                                    }
                                    onClick={() => {
                                        onAction({
                                            type: ResourceViewItemAction.DELETE,
                                            item,
                                        });
                                    }}
                                >
                                    {getDeleteLabel(t, item.type)}
                                </Menu.Item>
                            </>
                        )}
                </>
            )}
        </>
    );
};
