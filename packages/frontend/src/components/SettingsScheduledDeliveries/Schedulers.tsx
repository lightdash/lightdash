import { SchedulerWithLogs } from '@lightdash/common';
import { Box, Table } from '@mantine/core';
import { FC, useMemo } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';

type SchedulerType = SchedulerWithLogs['schedulers'][number];

type ColumnName = 'name';

interface Column {
    id: ColumnName;
    label?: string;
    cell: (item: SchedulerType) => React.ReactNode;
    // enableSorting: boolean;
    // sortingFn?: (a: SchedulerType, b: SchedulerType) => number;
    meta?: {
        style: React.CSSProperties;
    };
}

type SchedulersProps = {
    schedulers: SchedulerWithLogs['schedulers'];
    logs: SchedulerWithLogs['logs'];
    users: SchedulerWithLogs['users'];
};

const Schedulers: FC<SchedulersProps> = ({
    schedulers,
    // logs: schedulerLogs,
    // users,
}) => {
    const { classes } = useTableStyles();

    const columns = useMemo<Column[]>(
        () => [
            {
                id: 'name',
                label: 'Name',
                cell: (item: SchedulerType) => {
                    return item.name;
                },
                // enableSorting: true,
                // sortingFn: (a: SchedulerType, b: SchedulerType) => {
                //     return a.name.localeCompare(b.name);
                // },
                meta: {
                    style: {},
                },
            },
        ],
        [],
    );

    return (
        <Table className={classes.root} highlightOnHover>
            <thead>
                <tr>
                    {columns.map((column) => {
                        return (
                            <Box
                                component="th"
                                key={column.id}
                                style={column?.meta?.style}
                            >
                                {column?.label}
                            </Box>
                        );
                    })}
                </tr>
            </thead>

            <tbody>
                {schedulers.map((item) => (
                    <tr
                        key={item.schedulerUuid}
                        onClick={() => {
                            console.log('navigate here');
                            // history.push(getResourceUrl(projectUuid, item))
                        }}
                    >
                        {columns.map((column) => (
                            <td key={column.id}>{column.cell(item)}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default Schedulers;
