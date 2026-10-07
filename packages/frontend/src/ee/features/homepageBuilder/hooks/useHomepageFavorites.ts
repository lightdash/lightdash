import { ContentType, type SummaryContent } from '@lightdash/common';
import { useIsMutating } from '@tanstack/react-query';
import { useFavoriteMutation } from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';

export type HomepageFavorite = {
    isFavorite: boolean;
    isLoading: boolean;
    onToggle: () => void;
};

export const useHomepageFavorites = (projectUuid: string) => {
    const { data: favorites, isInitialLoading } = useFavorites(projectUuid);
    const { mutate } = useFavoriteMutation(projectUuid);
    const isMutating = useIsMutating({ mutationKey: ['favorite_toggle'] }) > 0;
    const favoriteUuids = new Set(
        (favorites ?? []).map((item) => item.data.uuid),
    );

    return (content: SummaryContent): HomepageFavorite | undefined => {
        if (
            content.contentType === ContentType.SPACE ||
            (content.contentType === ContentType.DATA_APP && !content.space)
        )
            return undefined;

        return {
            isFavorite: favoriteUuids.has(content.uuid),
            isLoading: isInitialLoading || isMutating,
            onToggle: () => {
                if (isInitialLoading || isMutating) return;
                mutate({
                    contentType: content.contentType,
                    contentUuid: content.uuid,
                });
            },
        };
    };
};
