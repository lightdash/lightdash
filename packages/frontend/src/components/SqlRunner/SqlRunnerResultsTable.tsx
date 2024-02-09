import { Field } from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useSqlQueryMutation } from '../../hooks/useSqlQuery';
import useSqlRunnerColumns from '../../hooks/useSqlRunnerColumns';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import RunSqlQueryButton from './RunSqlQueryButton';

const ResultsErrorState: FC<{ error: string }> = ({ error }) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <SuboptimalState icon={IconAlertCircle} description={error} />
        </div>
    </TrackSection>
);

export const ResultsIdleState: FC<
    React.ComponentProps<typeof RunSqlQueryButton>
> = (props) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <SuboptimalState
                description="Click run query to see your results"
                action={<RunSqlQueryButton {...props} />}
            />
        </div>
    </TrackSection>
);

const SqlRunnerResultsTable: FC<{
    sqlRunUuid: string;
    onSubmit: () => void;
    fieldsMap: Record<string, Field> | undefined;
    rows: Record<string, unknown>[] | undefined;
    sqlQueryMutation: ReturnType<typeof useSqlQueryMutation>;
}> = ({
    sqlRunUuid,
    onSubmit,
    fieldsMap,
    rows,
    sqlQueryMutation: { status, error },
}) => {
    const columns = useSqlRunnerColumns({
        fieldsMap,
    });

    if (error) {
        return <ResultsErrorState error={error.error.message} />;
    }

    const IdleState = () => (
        <ResultsIdleState onSubmit={onSubmit} isLoading={false} />
    );

    const data = (rows || []).map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, val]) => [
                `hack${sqlRunUuid}_${key}`,
                {
                    value: {
                        raw: val,
                        formatted: `${val}`,
                    },
                },
            ]),
        ),
    );

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box px="xs" pt="sm">
                <Table
                    status={status}
                    data={data}
                    columns={columns}
                    idleState={IdleState}
                    pagination={{
                        show: true,
                    }}
                    footer={{
                        show: true,
                    }}
                />
            </Box>
        </TrackSection>
    );
};

export default SqlRunnerResultsTable;
