import { type DashboardHeadingTile as DashboardHeadingTileType } from '@lightdash/common';
import { Text } from '@mantine-8/core';
import React, { type FC } from 'react';

import TileBase from './TileBase/index';

export type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    tile: DashboardHeadingTileType;
};

const DashboardHeadingTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { text },
        },
    } = props;

    return (
        <TileBase title="" transparent {...props}>
            <Text size="24px" fw="bold">
                {text}
            </Text>
        </TileBase>
    );
};

export default DashboardHeadingTile;
