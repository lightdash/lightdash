import { SqlRunnerResultsTransformer } from '@lightdash/common';
import { type FC } from 'react';
import CommonTable from '../../../../components/common/Table';
import { getRawValueCell } from '../../../../hooks/useColumns';
import { type useSqlQueryRun } from '../../hooks/useSqlQueryRun';

type Props = {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
};

export const Table: FC<Props> = ({ data }) => {
    const results = new SqlRunnerResultsTransformer({ data });

    const rows = results.getRows();
    const columns = results.getColumns();

    return (
        <CommonTable
            status="success"
            data={rows}
            columns={columns.map((s) => ({
                id: s,
                accessorKey: s,
                header: s.toLocaleUpperCase(),
                cell: getRawValueCell,
            }))}
            pagination={{
                show: false,
            }}
            footer={{
                show: true,
            }}
        />
    );
};
