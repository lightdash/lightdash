import { type ContentType } from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import useFavoritesContext from '../../../providers/Favorites/useFavoritesContext';

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
                {isFav ? (
                    <IconStarFilled size={14} color="orange" />
                ) : (
                    <IconStar size={14} color="gray" />
                )}
            </ActionIcon>
        </Tooltip>
    );
};

export default FavoriteButton;
