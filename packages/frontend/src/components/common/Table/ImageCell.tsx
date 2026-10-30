import { type Dimension } from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { IconPhotoOff } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './ImageCell.module.css';

export const BrokenImageCell = ({
    imageUrl,
    error,
}: {
    imageUrl: string;
    error?: string;
}) => {
    return (
        <Tooltip
            w="400px"
            label={`Could not load image "${imageUrl}" ${
                error ? `: ${error}` : ''
            }`}
        >
            <span className={classes.brokenImage}>
                <MantineIcon icon={IconPhotoOff} size="xxl" color="gray" />{' '}
                {/* xxl =32px same size as image cell */}
            </span>
        </Tooltip>
    );
};

export const ImageCell = ({
    item,
    imageUrl,
}: {
    item: Dimension;
    imageUrl: string;
}) => {
    const [isBroken, setIsBroken] = useState(false);

    if (isBroken) {
        return <BrokenImageCell imageUrl={imageUrl} />;
    }

    // Get dimensions and objectFit from item.image configuration
    const width = item.image?.width;
    const height = item.image?.height;

    return (
        <Tooltip
            label={
                // Full image in tooltip
                <img src={imageUrl} alt="" className={classes.tooltipImage} />
            }
        >
            {/* Small thumbnail in table cell */}
            <Box
                component="img"
                src={imageUrl}
                alt=""
                className={classes.thumbnail}
                style={{
                    '--image-fit': item.image?.fit ?? 'cover',
                    '--image-width': width ? `${width}px` : 'auto',
                    '--image-height': height
                        ? `${height}px`
                        : width
                          ? 'auto'
                          : '32px',
                }}
                onError={() => setIsBroken(true)}
            />
        </Tooltip>
    );
};
