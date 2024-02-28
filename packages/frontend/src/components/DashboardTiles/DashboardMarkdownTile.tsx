import { DashboardMarkdownTile } from '@lightdash/common';
import MDEditor from '@uiw/react-md-editor';
import React, { FC, useMemo, useState } from 'react';
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
    const showComments = useDashboardContext(
        (c) =>
            c.dashboardCommentsCheck?.userCanViewDashboardComments &&
            c.dashboardCommentsCheck?.isDashboardTileCommentsFeatureEnabled,
    );
    const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState(false);
    const {
        tile: {
            properties: { title, content },
        },
    } = props;
    const comments = useDashboardContext(
        (c) => c.dashboardComments && c.dashboardComments[props.tile.uuid],
    );

    const hasComments = useMemo(() => {
        return (comments || []).length > 0;
    }, [comments]);
    const dashboardComments = useMemo(() => {
        return (
            !!showComments && (
                <DashboardTileComments
                    opened={isCommentsMenuOpen}
                    onOpen={() => setIsCommentsMenuOpen(true)}
                    onClose={() => setIsCommentsMenuOpen(false)}
                    dashboardTileUuid={props.tile.uuid}
                />
            )
        );
    }, [showComments, isCommentsMenuOpen, props.tile.uuid]);
    return (
        <TileBase
            title={title}
            lockHeaderVisibility={isCommentsMenuOpen}
            visibleHeaderElement={hasComments ? dashboardComments : undefined}
            extraHeaderElement={hasComments ? undefined : dashboardComments}
            {...props}
        >
            <MarkdownWrapper className="non-draggable">
                <MDEditor.Markdown source={content} linkTarget="_blank" />
            </MarkdownWrapper>
        </TileBase>
    );
};

export default MarkdownTile;
