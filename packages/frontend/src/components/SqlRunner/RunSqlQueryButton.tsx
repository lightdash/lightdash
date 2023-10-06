import { Tooltip2 } from '@blueprintjs/popover2';
import { Kbd } from '@mantine/core';
import React, { FC } from 'react';
import { BigButton } from '../common/BigButton';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    onSubmit: () => void;
}> = ({ onSubmit, isLoading }) => (
    <Tooltip2
        content={
            <>
                <Kbd>ctrl</Kbd>
                <Kbd sx={{ marginLeft: '4px' }}>enter</Kbd>
            </>
        }
        disabled={isLoading}
    >
        <BigButton
            icon="play"
            intent="primary"
            style={{ width: 150 }}
            onClick={onSubmit}
            loading={isLoading}
        >
            Run query
        </BigButton>
    </Tooltip2>
);

export default RunSqlQueryButton;
