import { ResourceViewItemType, type FavoriteItems } from '@lightdash/common';
import { Card, Group, Text } from '@mantine/core';
import { IconStar } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('home');
    if (!favoriteItems || favoriteItems.length === 0) {
        if (showEmptyState) {
            return (
                <Card variant="dotted">
                    <Group justify="flex-start" gap="xxs" my="xs" ml="xs">
                        <MantineIcon
                            icon={IconStar}
                            size={20}
                            color="ldGray.7"
                        />
                        <Text fw={600} c="ldGray.8" fz="sm">
                            {t('favorites.emptyTitle')}
                        </Text>
                        <Text c="dimmed" fz="sm">
                            {t('favorites.emptyDescription')}
                        </Text>
                    </Group>
                </Card>
            );
        }
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
                        [ResourceViewItemType.DATA_APP],
                        [ResourceViewItemType.DOCUMENT],
                    ],
                }}
                headerProps={{
                    title: t('favorites.title'),
                    description: t('favorites.description'),
                }}
            />
        </PinnedItemsContext.Provider>
    );
};

export default FavoritesPanel;
