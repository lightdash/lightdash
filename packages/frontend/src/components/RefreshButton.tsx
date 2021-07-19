import { Button } from '@blueprintjs/core';
import React from 'react';
import { UseQueryResult } from 'react-query';
import { ApiError, ApiQueryResults } from 'common';
import { useExploreConfig } from '../hooks/useExploreConfig';
import { useApp } from '../providers/AppProvider';

type RefreshButtonProps = {
    queryResults: UseQueryResult<ApiQueryResults, ApiError>;
};
export const RefreshButton = ({ queryResults }: RefreshButtonProps) => {
    const { validQuery } = useExploreConfig();
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
            disabled={!validQuery}
            loading={isFetching}
        >
            Run query
        </Button>
    );
};
