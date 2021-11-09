import { NonIdealState } from '@blueprintjs/core';
import React, { FC, useMemo, useState } from 'react';
import { useSqlQueryMutation } from '../../hooks/useSqlQuery';
import { Section } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import { ResultsTable as Table } from '../ResultsTable/ResultsTable';
import RunSqlQueryButton from './RunSqlQueryButton';

const ResultsIdleState: FC<React.ComponentProps<typeof RunSqlQueryButton>> = (
    props,
) => (
    <Section name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="Click run query to see your results"
                action={<RunSqlQueryButton {...props} />}
            />
        </div>
    </Section>
);

const SqlRunnerResultsTable: FC<{
    onSubmit: () => void;
    sqlQueryMutation: ReturnType<typeof useSqlQueryMutation>;
}> = ({ onSubmit, sqlQueryMutation: { isIdle, isLoading, data } }) => {
    const [columnsOrder, setColumnsOrder] = useState<string[]>([]);

    const dataColumns = useMemo(() => {
        if (data && data.rows.length > 0) {
            return Object.keys(data.rows[0]).map((key) => ({
                Header: key,
                accessor: key,
                type: 'dimension',
                Cell: ({ value }: any) => {
                    if (value === null) return '∅';
                    if (value === undefined) return '-';
                    if (value instanceof Date) return value.toISOString();
                    return `${value}`;
                },
            }));
        }
        return [];
    }, [data]);

    return (
        <Table
            data={data?.rows || []}
            dataColumns={dataColumns}
            loading={isLoading}
            idle={isIdle}
            dataColumnOrder={columnsOrder}
            onColumnOrderChange={setColumnsOrder}
            idleState={
                <ResultsIdleState onSubmit={onSubmit} isLoading={isLoading} />
            }
        />
    );
};

export default SqlRunnerResultsTable;
