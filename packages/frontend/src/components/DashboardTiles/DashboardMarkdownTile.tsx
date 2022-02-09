import MDEditor from '@uiw/react-md-editor';
import { DashboardMarkdownTile } from 'common';
import React, { FC } from 'react';
import TileBase from './TileBase';

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
            <div
                style={{ flex: 1, overflow: 'auto' }}
                className="non-draggable"
            >
                <MDEditor.Markdown source={content} linkTarget="_blank" />
            </div>
        </TileBase>
    );
};

export default MarkdownTile;
