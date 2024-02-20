import { DashboardMarkdownTile } from '@lightdash/common';
import MDEditor from '@uiw/react-md-editor';
import React, { FC, useState } from 'react';
import { DashboardTileComments } from '../../features/comments';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { MarkdownWrapper } from './DashboardMarkdownTile.styles';
import TileBase from './TileBase/index';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    tile: DashboardMarkdownTile;
    showComments?: boolean;
};

const MarkdownTile: FC<Props> = (props) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState(false);
    const {
        tile: {
            properties: { title, content },
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
            <MarkdownWrapper className="non-draggable">
                <MDEditor.Markdown source={content} linkTarget="_blank" />
            </MarkdownWrapper>
        </TileBase>
    );
};

export default MarkdownTile;
