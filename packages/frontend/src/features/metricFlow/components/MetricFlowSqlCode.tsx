import { type ApiError } from '@lightdash/common';
import { Loader } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { type useQuery } from '@tanstack/react-query';
import React, { type ComponentProps, type FC } from 'react';
import { EmptyState } from '../../../components/common/EmptyState';
import ErrorState from '../../../components/common/ErrorState';
import type Table from '../../../components/common/Table';

interface Props {
    status: ComponentProps<typeof Table>['status'];
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

    // return <Prism language="sql">{sql || '# no sql available'}</Prism>;
};

export default MetricFlowSqlCode;
