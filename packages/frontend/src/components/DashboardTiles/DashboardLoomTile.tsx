import { type DashboardLoomTile } from '@lightdash/common';
import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import React, { useMemo, useState, type FC } from 'react';
import { DashboardTileComments } from '../../features/comments';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import tileClasses from './DashboardTiles.module.css';
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
                className={clsx('non-draggable', tileClasses.loomIframe)}
                src={`https://www.loom.com/embed/${getLoomId(url)}`}
                frameBorder="0"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                onLoad={() => {
                    setIsLoomLoaded(true);
                }}
            />
            {isLoomLoaded && <Box id={`loom-loaded-${uuid}`} display="none" />}
        </TileBase>
    );
};
export default LoomTile;
