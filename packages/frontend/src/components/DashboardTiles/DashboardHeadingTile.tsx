import { type DashboardHeadingTile as DashboardHeadingTileType } from '@lightdash/common';
import { Text } from '@mantine-8/core';
import { clsx } from '@mantine/core';
import React, { type FC } from 'react';
import styles from './DashboardHeadingTile.module.css';
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
            properties: { text, showDivider },
        },
    } = props;

    return (
        <TileBase title="" transparent {...props}>
            <Text
                size="24px"
                fw="bold"
                className={clsx(
                    styles.heading,
                    showDivider && styles.withDivider,
                )}
            >
                {text}
            </Text>
        </TileBase>
    );
};

export default DashboardHeadingTile;
