import { type DashboardLoomTile } from '@lightdash/common';
import React, { useMemo, useState, type FC } from 'react';
import { DashboardTileComments } from '../../features/comments';
import { useLoomThumbnail } from '../../hooks/useLoomThumbnail';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import TileBase from './TileBase/index';
import { getLoomId } from './TileForms/utils';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode' | 'minimal'
> & { tile: DashboardLoomTile };

const LoomTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { title, url },
            uuid,
        },
        minimal = false,
    } = props;

    const loomId = getLoomId(url);

    // Fetch thumbnail URL only in minimal mode (for screenshots)
    const { data: thumbnailData } = useLoomThumbnail(url, minimal);

    const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState(false);
    const showComments = useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canViewDashboardComments,
    );
    const tileHasComments = useDashboardContext((c) => c.hasTileComments(uuid));
    const dashboardComments = useMemo(
        () =>
            !!showComments && (
                <DashboardTileComments
                    opened={isCommentsMenuOpen}
                    onOpen={() => setIsCommentsMenuOpen(true)}
                    onClose={() => setIsCommentsMenuOpen(false)}
                    dashboardTileUuid={props.tile.uuid}
                />
            ),
        [showComments, isCommentsMenuOpen, props.tile.uuid],
    );

    return (
        <TileBase
            title={title}
            lockHeaderVisibility={isCommentsMenuOpen}
            visibleHeaderElement={
                tileHasComments ? dashboardComments : undefined
            }
            extraHeaderElement={tileHasComments ? undefined : dashboardComments}
            {...props}
        >
            {minimal && thumbnailData?.thumbnailUrl ? (
                <img
                    src={thumbnailData.thumbnailUrl}
                    alt={title}
                    style={{
                        flex: 1,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        objectPosition: 'top',
                    }}
                />
            ) : (
                <iframe
                    title={title}
                    className="non-draggable"
                    src={`https://www.loom.com/embed/${loomId}`}
                    frameBorder="0"
                    allowFullScreen
                    style={{
                        flex: 1,
                    }}
                />
            )}
        </TileBase>
    );
};
export default LoomTile;
