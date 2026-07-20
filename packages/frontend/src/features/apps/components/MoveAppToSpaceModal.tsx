import {
    ContentType,
    isApiError,
    ResourceViewItemType,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { Checkbox } from '@mantine-8/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import TransferItemsModal from '../../../components/common/TransferItemsModal/TransferItemsModal';
import useToaster from '../../../hooks/toaster/useToaster';
import { useContentAction } from '../../../hooks/useContent';
import {
    useAppThumbnailDelete,
    useAppThumbnailUrl,
} from '../hooks/useAppThumbnail';

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
    /** Called after a successful move, before the modal closes — for
     *  surface-specific cache invalidation (e.g. the My Apps list). */
    onMoved?: () => Promise<void> | void;
};

/**
 * "Move to space" / "Add to space" for a data app. Shared by the header's
 * overflow menu, its space chip, the My Apps settings list, and the browse
 * table so the move flow — and the app's ResourceViewItem shape it needs —
 * live in one place.
 *
 * When the app has a thumbnail, an "Include app thumbnail" checkbox (on by
 * default) lets the user strip it as part of the move, so a stale or
 * sensitive screenshot isn't shared with the space.
 */
export const MoveAppToSpaceModal: FC<Props> = ({
    projectUuid,
    app,
    opened,
    onClose,
    onMoved,
}) => {
    const queryClient = useQueryClient();
    const { showToastWarning } = useToaster();
    const { mutateAsync: contentAction, isLoading: isMovingToSpace } =
        useContentAction(projectUuid);

    // The checkbox is only offered when the app actually has a thumbnail —
    // a 404 here just means there's nothing to include.
    const { data: thumbnail } = useAppThumbnailUrl(
        projectUuid,
        app.uuid,
        opened,
    );
    const hasThumbnail = !!thumbnail;
    const [includeThumbnail, setIncludeThumbnail] = useState(true);
    const { mutateAsync: deleteThumbnail } = useAppThumbnailDelete();

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
            footer={
                hasThumbnail ? (
                    <Checkbox
                        checked={includeThumbnail}
                        onChange={(e) =>
                            setIncludeThumbnail(e.currentTarget.checked)
                        }
                        label="Include app thumbnail"
                        description="Uncheck to remove the app's current thumbnail when it moves."
                    />
                ) : null
            }
            onConfirm={async (targetSpaceUuid) => {
                if (!targetSpaceUuid) return;
                await contentAction({
                    action: { type: 'move', targetSpaceUuid },
                    item: { uuid: app.uuid, contentType: ContentType.DATA_APP },
                });
                if (hasThumbnail && !includeThumbnail) {
                    try {
                        await deleteThumbnail({
                            projectUuid,
                            appUuid: app.uuid,
                        });
                        void queryClient.invalidateQueries({
                            queryKey: ['app-thumbnail', projectUuid, app.uuid],
                        });
                    } catch (err) {
                        // The move already succeeded — don't fail the flow.
                        showToastWarning({
                            title: 'Thumbnail not removed',
                            subtitle: isApiError(err)
                                ? err.error.message
                                : 'Unknown error',
                        });
                    }
                }
                await queryClient.invalidateQueries({
                    queryKey: ['app', projectUuid, app.uuid],
                });
                await onMoved?.();
                onClose();
            }}
        />
    );
};
