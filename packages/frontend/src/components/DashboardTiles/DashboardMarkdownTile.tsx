import MDEditor from '@uiw/react-md-editor';
import { DashboardMarkdownTile } from 'common';
import React, { FC } from 'react';
import TileBase from './TileBase';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete'
> & { tile: DashboardMarkdownTile };

const MarkdownTile: FC<Props> = ({ tile, onDelete, onEdit }) => (
    <TileBase
        title={tile.properties.title}
        tile={tile}
        onDelete={onDelete}
        onEdit={onEdit}
    >
        <div style={{ flex: 1, overflow: 'auto' }} className="non-draggable">
            <MDEditor.Markdown
                source={tile.properties.content}
                linkTarget="_blank"
            />
        </div>
    </TileBase>
);

export default MarkdownTile;
