import { Button } from '@blueprintjs/core';
import React from 'react';
import { UseQueryResult } from 'react-query';
import { ApiError, ApiQueryResults } from 'common';
import { useApp } from '../providers/AppProvider';
import { useExplorer } from '../providers/ExplorerProvider';

type RefreshButtonProps = {
    queryResults: UseQueryResult<ApiQueryResults, ApiError>;
};
export const RefreshButton = ({ queryResults }: RefreshButtonProps) => {
    const {
        state: { isValidQuery },
    } = useExplorer();
    const { refetch, isFetching } = queryResults;
    const { rudder } = useApp();
    return (
        <Button
            intent="primary"
            style={{ height: '40px', width: 150, marginRight: '10px' }}
            onClick={() => {
                refetch();
                rudder.track('query_executed');
            }}
            disabled={!isValidQuery}
            loading={isFetching}
        >
            Run query
        </Button>
    );
};
