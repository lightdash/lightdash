import { DashboardLoomTile } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { DashboardTileComments } from '../../features/comments';
import { useDashboardContext } from '../../providers/DashboardProvider';
import TileBase from './TileBase/index';
import { getLoomId } from './TileForms/LoomTileForm';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: DashboardLoomTile };

const LoomTile: FC<Props> = (props) => {
    const showComments = useDashboardContext(
        (c) =>
            c.dashboardCommentsCheck?.canViewDashboardComments &&
            c.dashboardCommentsCheck?.isDashboardTileCommentsFeatureEnabled,
    );
    const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState(false);
    const {
        tile: {
            properties: { title, url },
        },
    } = props;
    return (
        <TileBase
            title={title}
            lockHeaderVisibility={isCommentsMenuOpen}
            extraHeaderElement={
                !!showComments && (
                    <DashboardTileComments
                        opened={isCommentsMenuOpen}
                        onOpen={() => setIsCommentsMenuOpen(true)}
                        onClose={() => setIsCommentsMenuOpen(false)}
                        dashboardTileUuid={props.tile.uuid}
                    />
                )
            }
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
            />
        </TileBase>
    );
};
export default LoomTile;
