import { type DashboardMarkdownTile } from '@lightdash/common';
import MDEditor from '@uiw/react-md-editor';
import React, { useMemo, useState, type FC } from 'react';
import { DashboardTileComments } from '../../features/comments';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { MarkdownWrapper } from './DashboardMarkdownTile.styles';
import TileBase from './TileBase/index';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    tile: DashboardMarkdownTile;
};

const MarkdownTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { title, content },
            uuid,
        },
    } = props;

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
            <MarkdownWrapper className="non-draggable">
                <MDEditor.Markdown source={content} linkTarget="_blank" />
            </MarkdownWrapper>
        </TileBase>
    );
};

export default MarkdownTile;
