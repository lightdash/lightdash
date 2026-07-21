import {
    ContentType,
    isApiError,
    ResourceViewItemType,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { Box, Checkbox, Tooltip } from '@mantine-8/core';
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

    // The checkbox always renders but is only enabled when the app actually
    // has a thumbnail — a 404 here just means there's nothing to include.
    // The error guard matters because react-query keeps stale data when a
    // refetch fails.
    const thumbnailQuery = useAppThumbnailUrl(projectUuid, app.uuid, opened);
    const hasThumbnail = !thumbnailQuery.isError && !!thumbnailQuery.data;
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
                <Tooltip
                    label={
                        hasThumbnail || thumbnailQuery.isLoading
                            ? "Uncheck to remove the app's current thumbnail when it moves."
                            : 'This app has no thumbnail to include — capture one from the builder.'
                    }
                    withArrow
                    position="top"
                >
                    <Box>
                        <Checkbox
                            checked={
                                hasThumbnail
                                    ? includeThumbnail
                                    : thumbnailQuery.isLoading
                            }
                            disabled={!hasThumbnail}
                            onChange={(e) =>
                                setIncludeThumbnail(e.currentTarget.checked)
                            }
                            label="Include app thumbnail"
                        />
                    </Box>
                </Tooltip>
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
                        // Reset (not invalidate): a refetch of the deleted
                        // thumbnail 404s and react-query would keep the stale
                        // signed URL as data, leaving consumers rendering a
                        // broken image.
                        void queryClient.resetQueries({
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
