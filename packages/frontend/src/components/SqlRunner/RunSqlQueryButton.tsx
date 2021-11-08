import React, { FC } from 'react';
import { BigButton } from '../common/BigButton';

const RunSqlQueryButton: FC<{ isLoading: boolean; onSubmit: () => void }> = ({
    onSubmit,
    isLoading,
}) => (
    <BigButton
        intent="primary"
        style={{ width: 150, marginRight: '10px' }}
        onClick={onSubmit}
        loading={isLoading}
    >
        Run query
    </BigButton>
);

export default RunSqlQueryButton;
