import { type Dimension } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { IconPhotoOff } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../MantineIcon';

export const BrokenImageCell = ({
    imageUrl,
    error,
}: {
    imageUrl: string;
    error?: string;
}) => {
    return (
        <Tooltip
            withinPortal
            w="400px"
            multiline
            label={`Could not load image "${imageUrl}" ${
                error ? `: ${error}` : ''
            }`}
        >
            <span style={{ display: 'inline-block', lineHeight: 0 }}>
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

    const size =
        width || height
            ? {
                  width: width ? `${width}px` : 'auto',
                  height: height ? `${height}px` : 'auto',
              }
            : { height: '32px', width: 'auto' };

    // Cast fit to allow any string value
    // If fit is not a valid value, this will not cause any error
    const objectFit = (item.image?.fit ??
        'cover') as React.CSSProperties['objectFit'];

    const imageStyle: React.CSSProperties = {
        display: 'block',
        objectFit,
        ...size,
    };

    return (
        <Tooltip
            withinPortal
            label={
                // Full image in tooltip
                <img
                    src={imageUrl}
                    alt=""
                    style={{ maxWidth: '400px', maxHeight: '400px' }}
                />
            }
        >
            {/* Small thumbnail in table cell */}
            <img
                src={imageUrl}
                alt=""
                style={imageStyle}
                onError={() => setIsBroken(true)}
            />
        </Tooltip>
    );
};
