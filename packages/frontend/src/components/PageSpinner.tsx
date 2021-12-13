import { Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { ReactComponent as Logo } from '../svgs/grey-icon-logo.svg';

const PageSpinner: FC = () => (
    <div
        style={{
            height: '100vh',
            display: 'grid',
        }}
        data-testid="page-spinner"
    >
        <Spinner size={100} />
        <Logo
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                height: 32,
                width: 32,
            }}
        />
    </div>
);

export default PageSpinner;
