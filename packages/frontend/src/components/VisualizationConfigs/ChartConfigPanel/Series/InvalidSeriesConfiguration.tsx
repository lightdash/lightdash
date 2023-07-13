import { Colors } from '@blueprintjs/core';
import React, { FC } from 'react';
import { SeriesBlock } from './Series.styles';

const InvalidSeriesConfiguration: FC<{ itemId: string }> = ({ itemId }) => {
    return (
        <SeriesBlock>
            <span
                style={{
                    width: '100%',
                    color: Colors.GRAY1,
                }}
            >
                Tried to reference field with unknown id: {itemId}
            </span>
        </SeriesBlock>
    );
};

export default InvalidSeriesConfiguration;
