import { DashboardLoomTile } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { DashboardTileComments } from '../../features/comments';
import { useDashboardContext } from '../../providers/DashboardProvider';
import TileBase from './TileBase/index';
import { getLoomId } from './TileForms/LoomTileForm';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: DashboardLoomTile; showComments?: boolean };

const LoomTile: FC<Props> = (props) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
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
                !!props.showComments &&
                projectUuid &&
                dashboardUuid && (
                    <DashboardTileComments
                        opened={isCommentsMenuOpen}
                        onOpen={() => setIsCommentsMenuOpen(true)}
                        onClose={() => setIsCommentsMenuOpen(false)}
                        projectUuid={projectUuid}
                        dashboardTileUuid={props.tile.uuid}
                        dashboardUuid={dashboardUuid}
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
