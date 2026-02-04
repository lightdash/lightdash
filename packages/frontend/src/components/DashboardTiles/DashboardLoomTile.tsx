import { type DashboardLoomTile } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import React, { useMemo, useState, type FC } from 'react';
import { DashboardTileComments } from '../../features/comments';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import TileBase from './TileBase/index';
import { getLoomId } from './TileForms/utils';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: DashboardLoomTile };

const LoomTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { title, url },
            uuid,
        },
    } = props;

    const [isLoomLoaded, setIsLoomLoaded] = useState(false);
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
            <iframe
                title={title}
                className="non-draggable"
                src={`https://www.loom.com/embed/${getLoomId(url)}`}
                frameBorder="0"
                allowFullScreen
                style={{
                    flex: 1,
                }}
                onLoad={() => {
                    setIsLoomLoaded(true);
                }}
            />
            {isLoomLoaded && <Box id={`loom-loaded-${uuid}`} display="none" />}
        </TileBase>
    );
};
export default LoomTile;
