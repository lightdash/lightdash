import { type DashboardMarkdownTile } from '@lightdash/common';
import { Text } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import React, { useMemo, useState, type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import { DashboardTileComments } from '../../features/comments';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
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
            <Text
                className="non-draggable"
                component="div"
                sx={{
                    flex: 1,
                    overflow: 'auto',
                    '.wmde-markdown': {
                        fontSize: '14px',
                    },
                }}
            >
                <MarkdownPreview
                    source={content}
                    rehypePlugins={[
                        [rehypeExternalLinks, { target: '_blank' }],
                    ]}
                />
            </Text>
        </TileBase>
    );
};

export default MarkdownTile;
