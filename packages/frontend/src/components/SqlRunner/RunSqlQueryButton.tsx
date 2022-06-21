import { KeyCombo } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import { BigButton } from '../common/BigButton';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    onSubmit: () => void;
}> = ({ onSubmit, isLoading }) => (
    <Tooltip2 content={<KeyCombo combo="cmd+enter" />} disabled={isLoading}>
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
