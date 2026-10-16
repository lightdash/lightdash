import {
    ContentType,
    ResourceViewItemType,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import TransferItemsModal from '../../../components/common/TransferItemsModal/TransferItemsModal';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
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

type FavoritePersonalDataAppModalProps = {
    projectUuid: string;
    app: DataAppFavoriteTarget;
    opened: boolean;
    onClose: () => void;
};

export const FavoritePersonalDataAppModal: FC<
    FavoritePersonalDataAppModalProps
> = ({ projectUuid, app, opened, onClose }) => {
    const { t } = useTranslation('apps');
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
            title={t('favoritePersonal.title')}
            description={
                <Callout variant="info">
                    <Text fz="sm">{t('favoritePersonal.mustBeInSpace')}</Text>
                    <Text fz="sm" mt="xs">
                        {t('favoritePersonal.question')}
                    </Text>
                </Callout>
            }
            confirmLabel={t('favoritePersonal.confirm')}
            createSpaceConfirmLabel={t('favoritePersonal.createSpaceConfirm')}
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
                        latestReadyVersionNumber:
                            app.latestVersionStatus === 'ready'
                                ? app.latestVersionNumber
                                : null,
                        pinnedListUuid: null,
                        pinnedListOrder: null,
                        verification: null,
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
