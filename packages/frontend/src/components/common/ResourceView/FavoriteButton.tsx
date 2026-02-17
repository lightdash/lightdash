import { type ContentType } from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine-8/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import useFavoritesContext from '../../../providers/Favorites/useFavoritesContext';
import MantineIcon from '../MantineIcon';

interface FavoriteButtonProps {
    contentType: ContentType;
    contentUuid: string;
}

const FavoriteButton: FC<FavoriteButtonProps> = ({
    contentType,
    contentUuid,
}) => {
    const context = useFavoritesContext();

    if (!context) {
        return null;
    }

    const { isFavorited, toggleFavorite } = context;
    const isFav = isFavorited(contentUuid);

    return (
        <Tooltip label={isFav ? 'Remove from favorites' : 'Add to favorites'}>
            <ActionIcon
                size="xs"
                variant="transparent"
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleFavorite(contentType, contentUuid);
                }}
            >
                <MantineIcon
                    icon={isFav ? IconStarFilled : IconStar}
                    size="sm"
                    color={isFav ? 'orange' : 'ldGray.6'}
                />
            </ActionIcon>
        </Tooltip>
    );
};

export default FavoriteButton;
