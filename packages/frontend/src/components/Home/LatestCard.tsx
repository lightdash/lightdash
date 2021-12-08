import { Card, Classes, Colors, Divider, H5 } from '@blueprintjs/core';
import React, { FC } from 'react';

const LatestCard: FC<{
    isLoading: boolean;
    title: React.ReactNode;
    headerAction?: React.ReactNode;
}> = ({ isLoading, title, headerAction, children }) => (
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
                justifyContent: 'space-between',
            }}
        >
            <H5
                style={{ margin: 0, color: Colors.GRAY1 }}
                className={isLoading ? Classes.SKELETON : undefined}
            >
                {title}
            </H5>
            {isLoading ? null : headerAction}
        </div>
        <Divider style={{ margin: '20px 0' }} />
        <div
            className={isLoading ? Classes.SKELETON : undefined}
            style={{ flex: 1 }}
        >
            {children}
        </div>
    </Card>
);

export default LatestCard;
