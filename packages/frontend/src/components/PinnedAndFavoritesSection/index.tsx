import {
    ResourceItemCategory,
    ResourceViewItemType,
    type FavoriteItems,
    type PinnedItems,
    type ResourceViewItem,
} from '@lightdash/common';
import { IconPin, IconStar } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import useApp from '../../providers/App/useApp';
import usePinnedItemsContext from '../../providers/PinnedItems/usePinnedItemsContext';
import MantineIcon from '../common/MantineIcon';
import ResourceView from '../common/ResourceView';
import { ResourceViewType } from '../common/ResourceView/types';
import FavoritesPanel from '../FavoritesPanel';
import PinnedItemsPanel from '../PinnedItemsPanel';

const GRID_GROUPS = [
    [ResourceViewItemType.SPACE],
    [ResourceViewItemType.DASHBOARD, ResourceViewItemType.CHART],
];

const TYPE_SORT_ORDER: Record<string, number> = {
    [ResourceViewItemType.SPACE]: 0,
    [ResourceViewItemType.DASHBOARD]: 1,
    [ResourceViewItemType.CHART]: 2,
};

const sortByType = (a: ResourceViewItem, b: ResourceViewItem): number =>
    (TYPE_SORT_ORDER[a.type] ?? 3) - (TYPE_SORT_ORDER[b.type] ?? 3);

interface Props {
    pinnedItems: PinnedItems;
    favoriteItems: FavoriteItems;
    pinnedIsEnabled: boolean;
}

const PinnedAndFavoritesSection: FC<Props> = ({
    pinnedItems,
    favoriteItems,
    pinnedIsEnabled,
}) => {
    const { user } = useApp();
    const { userCanManage } = usePinnedItemsContext();
    const isAdmin = user.data?.ability?.can('manage', 'Organization') ?? false;

    const hasPinned = pinnedItems.length > 0;
    const hasFavorites = favoriteItems.length > 0;

    const mergedItems = useMemo(() => {
        const pinned = pinnedItems.map((item) => ({
            ...item,
            category: ResourceItemCategory.PINNED,
        }));
        const favorites = favoriteItems.map((item) => ({
            ...item,
            category: ResourceItemCategory.FAVORITES,
        }));
        return [...pinned, ...favorites];
    }, [pinnedItems, favoriteItems]);

    // At least one has items: show tabbed ResourceView with empty state inside tabs
    if (hasPinned || hasFavorites) {
        return (
            <ResourceView
                items={mergedItems}
                view={ResourceViewType.GRID}
                hasReorder={userCanManage}
                defaultActiveTab={hasFavorites ? 'favorites' : 'pinned'}
                tabs={[
                    {
                        id: 'favorites',
                        name: 'My favorites',
                        icon: <MantineIcon icon={IconStar} size="sm" />,
                        infoTooltipText:
                            'Your personally favorited spaces, dashboards, and charts.',
                        hasReorder: false,
                        sort: sortByType,
                        filter: (item) =>
                            'category' in item &&
                            item.category === ResourceItemCategory.FAVORITES,
                        emptyStateProps: {
                            icon: <MantineIcon icon={IconStar} size={24} />,
                            title: 'No favorites yet',
                            description:
                                'Star items to add them to your personal favorites.',
                        },
                    },
                    {
                        id: 'pinned',
                        name: userCanManage ? 'Pinned items' : 'Pinned for you',
                        icon: <MantineIcon icon={IconPin} size="sm" />,
                        infoTooltipText: userCanManage
                            ? 'Pin Spaces, Dashboards and Charts to the top of the homepage to guide your business users to the right content.'
                            : 'Your data team have pinned these items to help guide you towards the most relevant content!',
                        hasReorder: userCanManage,
                        filter: (item) =>
                            'category' in item &&
                            item.category === ResourceItemCategory.PINNED,
                        emptyStateProps: {
                            icon: <MantineIcon icon={IconPin} size={24} />,
                            title: 'No pinned items',
                            description: userCanManage
                                ? 'Pin items to the top of the homepage to guide users to relevant content.'
                                : 'Your data team has not pinned any items yet.',
                        },
                    },
                ]}
                gridProps={{ groups: GRID_GROUPS }}
                emptyStateProps={{
                    icon: <MantineIcon icon={IconStar} size={24} />,
                    title: 'No favorites yet',
                    description:
                        'Star items to add them to your personal favorites.',
                }}
            />
        );
    }

    // Neither has items:
    // - Admins see pinned empty state + favorites empty state
    // - Non-admins see only favorites empty state
    return (
        <>
            {isAdmin && pinnedIsEnabled && (
                <PinnedItemsPanel
                    pinnedItems={pinnedItems}
                    isEnabled={pinnedIsEnabled}
                />
            )}
            <FavoritesPanel favoriteItems={favoriteItems} showEmptyState />
        </>
    );
};

export default PinnedAndFavoritesSection;
