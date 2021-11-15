import { Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';

const PageSpinner: FC = () => (
    <div
        style={{
            height: '100vh',
            display: 'grid',
        }}
        data-testid="page-spinner"
    >
        <Spinner size={100} />
        <img
            src={`${process.env.PUBLIC_URL}/favicon-32x32.png`}
            alt="Lightdash"
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
            }}
        />
    </div>
);

export default PageSpinner;
