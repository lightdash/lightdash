import { ApiError } from '@lightdash/common';
import { Loader } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { useQuery } from '@tanstack/react-query';
import React, { FC } from 'react';
import { EmptyState } from '../../../components/common/EmptyState';
import ErrorState from '../../../components/common/ErrorState';

interface Props {
    status: ReturnType<typeof useQuery>['status'];
    sql: string | null | undefined;
    error: ReturnType<typeof useQuery<any, ApiError>>['error'];
}

const MetricFlowSqlCode: FC<Props> = ({ status, sql, error }) => {
    if (status === 'loading') {
        return (
            <EmptyState title="Loading sql">
                <Loader color="gray" />
            </EmptyState>
        );
    }

    if (status === 'error') {
        return <ErrorState error={error?.error} />;
    }

    return <Prism language="sql">{sql || '# no sql available'}</Prism>;
};

export default MetricFlowSqlCode;
