import { Card, Colors, Divider, H5 } from '@blueprintjs/core';
import React, { FC } from 'react';

const LatestCard: FC<{
    title: React.ReactNode;
    headerAction?: React.ReactNode;
}> = ({ title, headerAction, children }) => (
    <Card
        style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            marginBottom: 40,
        }}
    >
        <div
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <H5 style={{ flex: 1, margin: 0, color: Colors.GRAY1 }}>{title}</H5>
            {headerAction}
        </div>
        <Divider style={{ margin: '20px 0' }} />
        {children}
    </Card>
);

export default LatestCard;
