import { ResourceViewItemType, type FavoriteItems } from '@lightdash/common';
import { type FC } from 'react';
import PinnedItemsContext from '../../providers/PinnedItems/context';
import { type PinnedItemsContextType } from '../../providers/PinnedItems/types';
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
}

const FavoritesPanel: FC<Props> = ({ favoriteItems }) => {
    if (!favoriteItems || favoriteItems.length === 0) {
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
            />
        </PinnedItemsContext.Provider>
    );
};

export default FavoritesPanel;
