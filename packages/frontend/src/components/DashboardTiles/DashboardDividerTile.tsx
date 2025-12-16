import { type DashboardDividerTile as DashboardDividerTileType } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { clsx } from '@mantine/core';
import React, { type FC } from 'react';

import styles from './DashboardDividerTile.module.css';
import TileBase from './TileBase/index';

export type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    tile: DashboardDividerTileType;
};

const DashboardDividerTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { orientation },
        },
    } = props;

    return (
        <TileBase title="" transparent {...props}>
            <Box
                className={clsx(styles.divider, {
                    [styles.dividerVertical]: orientation === 'vertical',
                })}
            />
        </TileBase>
    );
};

export default DashboardDividerTile;
