import { Table } from '@mantine/core';
import { useMemo } from 'react';
import { type TableDto } from '../../Dto/VizLibDto/TableDto';

const TableViz = ({ tableDto }: { tableDto: TableDto }) => {
    const options = useMemo(() => {
        return tableDto.getConfig();
    }, [tableDto]);
    return (
        <Table>
            <thead>
                <tr>
                    {options.columns.map((column) => (
                        <th key={column}>{column}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {options.rows.map((row, index) => (
                    <tr key={index}>
                        {options.columns.map((column) => (
                            <td key={column}>{row[column] as string}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default TableViz;
