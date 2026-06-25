import {
    ContentType,
    ResourceViewItemType,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import TransferItemsModal from '../../../components/common/TransferItemsModal/TransferItemsModal';
import { useContentAction } from '../../../hooks/useContent';

export type DataAppMoveTarget = Pick<
    ResourceViewDataAppItem['data'],
    | 'uuid'
    | 'name'
    | 'description'
    | 'spaceUuid'
    | 'createdByUserUuid'
    | 'latestVersionNumber'
    | 'latestVersionStatus'
>;

type Props = {
    projectUuid: string;
    app: DataAppMoveTarget;
    opened: boolean;
    onClose: () => void;
};

/**
 * "Move to space" / "Add to space" for a data app. Shared by the header's
 * overflow menu and its space chip so the move flow — and the app's
 * ResourceViewItem shape it needs — live in one place.
 */
export const MoveAppToSpaceModal: FC<Props> = ({
    projectUuid,
    app,
    opened,
    onClose,
}) => {
    const queryClient = useQueryClient();
    const { mutateAsync: contentAction, isLoading: isMovingToSpace } =
        useContentAction(projectUuid);

    return (
        <TransferItemsModal
            projectUuid={projectUuid}
            opened={opened}
            onClose={onClose}
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
            isLoading={isMovingToSpace}
            onConfirm={async (targetSpaceUuid) => {
                if (!targetSpaceUuid) return;
                await contentAction({
                    action: { type: 'move', targetSpaceUuid },
                    item: { uuid: app.uuid, contentType: ContentType.DATA_APP },
                });
                await queryClient.invalidateQueries({
                    queryKey: ['app', projectUuid, app.uuid],
                });
                onClose();
            }}
        />
    );
};
