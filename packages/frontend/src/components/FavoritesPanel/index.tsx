import { ResourceViewItemType, type FavoriteItems } from '@lightdash/common';
import { IconStar } from '@tabler/icons-react';
import { type FC } from 'react';
import PinnedItemsContext from '../../providers/PinnedItems/context';
import { type PinnedItemsContextType } from '../../providers/PinnedItems/types';
import MantineIcon from '../common/MantineIcon';
import ResourceView from '../common/ResourceView';
import { ResourceViewType } from '../common/ResourceView/types';

const noop = () => {};

const noopPinnedContext: PinnedItemsContextType = {
    userCanManage: false,
    reorderItems: noop as PinnedItemsContextType['reorderItems'],
    allowDelete: false,
};

interface Props {
    favoriteItems: FavoriteItems;
    showEmptyState?: boolean;
}

const FavoritesPanel: FC<Props> = ({
    favoriteItems,
    showEmptyState = false,
}) => {
    if (!showEmptyState && (!favoriteItems || favoriteItems.length === 0)) {
        return null;
    }

    return (
        <PinnedItemsContext.Provider value={noopPinnedContext}>
            <ResourceView
                items={favoriteItems}
                view={ResourceViewType.GRID}
                gridProps={{
                    groups: [
                        [ResourceViewItemType.SPACE],
                        [
                            ResourceViewItemType.DASHBOARD,
                            ResourceViewItemType.CHART,
                        ],
                    ],
                }}
                headerProps={{
                    title: 'My favorites',
                    description:
                        'Your personally favorited spaces, dashboards, and charts.',
                }}
                emptyStateProps={{
                    icon: <MantineIcon icon={IconStar} size={24} />,
                    title: 'No favorites yet',
                    description:
                        'Star items to add them to your personal favorites.',
                }}
            />
        </PinnedItemsContext.Provider>
    );
};

export default FavoritesPanel;
