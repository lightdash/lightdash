import { DashboardLoomTile } from '@lightdash/common';
import React, { FC } from 'react';
import TileBase from './TileBase/index';
import { getLoomId } from './TileForms/LoomTileForm';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: DashboardLoomTile };

const LoomTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { title, url },
        },
    } = props;
    return (
        <TileBase title={title} clickableTitle={false} {...props}>
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
