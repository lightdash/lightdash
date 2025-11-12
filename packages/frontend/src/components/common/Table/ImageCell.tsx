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
    imageUrl,
}: {
    item: Dimension;
    imageUrl: string;
}) => {
    const [isBroken, setIsBroken] = useState(false);

    if (isBroken) {
        return <BrokenImageCell imageUrl={imageUrl} />;
    }

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
                style={{
                    height: '32px',
                    width: 'auto',
                    display: 'block',
                    objectFit: 'contain',
                }}
                onError={() => setIsBroken(true)}
            />
        </Tooltip>
    );
};
