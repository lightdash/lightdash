import { DashboardMarkdownTile } from '@lightdash/common';
import MDEditor from '@uiw/react-md-editor';
import React, { FC } from 'react';
import { MarkdownWrapper } from './DashboardMarkdownTile.styles';
import TileBase from './TileBase/index';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: DashboardMarkdownTile };

const MarkdownTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { title, content },
        },
    } = props;
    return (
        <TileBase title={title} {...props}>
            <MarkdownWrapper className="non-draggable">
                <MDEditor.Markdown source={content} linkTarget="_blank" />
            </MarkdownWrapper>
        </TileBase>
    );
};

export default MarkdownTile;
