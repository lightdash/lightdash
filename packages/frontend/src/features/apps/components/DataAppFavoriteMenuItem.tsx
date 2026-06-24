import {
    ContentType,
    ResourceViewItemType,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { Menu, Text } from '@mantine-8/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import TransferItemsModal from '../../../components/common/TransferItemsModal/TransferItemsModal';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { useContentAction } from '../../../hooks/useContent';

type DataAppFavoriteTarget = Pick<
    ResourceViewDataAppItem['data'],
    | 'uuid'
    | 'name'
    | 'description'
    | 'spaceUuid'
    | 'createdByUserUuid'
    | 'latestVersionNumber'
    | 'latestVersionStatus'
>;

type DataAppFavoriteMenuItemProps = {
    projectUuid: string;
    appUuid: string;
    appSpaceUuid: string | null;
    onAddPersonalAppToSpace: () => void;
};

export const DataAppFavoriteMenuItem: FC<DataAppFavoriteMenuItemProps> = ({
    projectUuid,
    appUuid,
    appSpaceUuid,
    onAddPersonalAppToSpace,
}) => {
    const { data: favorites } = useFavorites(projectUuid);
    const favoriteMutation = useFavoriteMutation(projectUuid);
    const isFavorited =
        favorites?.some((favorite) => favorite.data.uuid === appUuid) ?? false;

    return (
        <Menu.Item
            leftSection={
                isFavorited ? (
                    <IconStarFilled size={14} color="orange" />
                ) : (
                    <IconStar size={14} />
                )
            }
            disabled={favoriteMutation.isLoading}
            onClick={() => {
                if (!isFavorited && !appSpaceUuid) {
                    onAddPersonalAppToSpace();
                    return;
                }

                favoriteMutation.mutate({
                    contentType: ContentType.DATA_APP,
                    contentUuid: appUuid,
                });
            }}
        >
            {isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        </Menu.Item>
    );
};

type FavoritePersonalDataAppModalProps = {
    projectUuid: string;
    app: DataAppFavoriteTarget;
    opened: boolean;
    onClose: () => void;
};

export const FavoritePersonalDataAppModal: FC<
    FavoritePersonalDataAppModalProps
> = ({ projectUuid, app, opened, onClose }) => {
    const queryClient = useQueryClient();
    const { mutateAsync: contentAction, isLoading: isMovingToSpace } =
        useContentAction(projectUuid);
    const { mutateAsync: toggleFavorite, isLoading: isTogglingFavorite } =
        useFavoriteMutation(projectUuid);

    return (
        <TransferItemsModal
            projectUuid={projectUuid}
            opened={opened}
            onClose={onClose}
            title="Add data app to a space"
            description={
                <Callout variant="info">
                    <Text fz="sm">
                        Data apps must be in a space to be favorited.
                    </Text>
                    <Text fz="sm" mt="xs">
                        Would you like to move this data app to a space and
                        favorite it?
                    </Text>
                </Callout>
            }
            confirmLabel="Move and favorite"
            createSpaceConfirmLabel="Create space, move and favorite"
            items={[
                {
                    type: ResourceViewItemType.DATA_APP,
                    data: {
                        uuid: app.uuid,
                        name: app.name,
                        description: app.description,
                        spaceUuid: app.spaceUuid,
                        createdByUserUuid: app.createdByUserUuid,
                        updatedAt: new Date(),
                        updatedByUser: null,
                        views: 0,
                        firstViewedAt: null,
                        latestVersionNumber: app.latestVersionNumber,
                        latestVersionStatus: app.latestVersionStatus,
                        pinnedListUuid: null,
                        pinnedListOrder: null,
                    },
                },
            ]}
            isLoading={isMovingToSpace || isTogglingFavorite}
            onConfirm={async (targetSpaceUuid) => {
                if (!targetSpaceUuid) return;
                await contentAction({
                    action: {
                        type: 'move',
                        targetSpaceUuid,
                    },
                    item: {
                        uuid: app.uuid,
                        contentType: ContentType.DATA_APP,
                    },
                });
                await queryClient.invalidateQueries({
                    queryKey: ['app', projectUuid, app.uuid],
                });
                await toggleFavorite({
                    contentType: ContentType.DATA_APP,
                    contentUuid: app.uuid,
                });
                onClose();
            }}
        />
    );
};
