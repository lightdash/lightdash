import { PivotData } from '@lightdash/common';
import { createStyles, Table } from '@mantine/core';
import { uniq } from 'lodash-es';
import { FC } from 'react';

const test1: PivotData = {
    dimensions: {
        page: {
            label: 'Page',
            visible: true,
        },
        site: {
            label: 'Page',
            visible: true,
        },
    },
    metrics: {
        views: {
            label: 'View count',
            visible: true,
        },
        devices: {
            label: 'Device Count',
            visible: true,
        },
    },

    headerValueTypes: [
        { type: 'dimension', field: 'site' },
        { type: 'metrics' },
    ],
    headerValues: [
        ['blog', 'blog', 'docs', 'docs'],
        ['views', 'devices', 'views', 'devices'],
    ],
    columnTypes: [
        { type: 'dimensionIndex', field: 'page', freeze: true },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
    ],
    rowValues: [
        ['/about', 12, 0, 2, 13],
        ['/first-post', 11, 1, 0, 0],
        ['/home', 6, 7, 2, 10],
    ],
    columnTotals: [null, 99, 99, 99, 99],
    rowTotals: [null, null, null, null, null],
};

const useTableStyles = createStyles((theme) => ({
    header: {
        backgroundColor: 'red',
        fontWeight: theme.fn.fontStyles().fontWeight,
    },
}));

const RenderTable: FC<{ data: PivotData }> = ({ data }) => {
    const { classes } = useTableStyles();

    const indexColumns = data.columnTypes.filter((c) => c.type !== 'value');

    const headerRowSize = data.headerValueTypes.length;
    const rowSize = data.rowValues.length + (data.rowTotals ? 1 : 0);

    return (
        <Table withBorder withColumnBorders highlightOnHover>
            <thead></thead>
            <tbody>
                {data.rowValues.map((row, rowIndex) => {
                    return (
                        <tr key={rowIndex}>
                            {row.map((value, valueIndex) => {
                                return <td key={valueIndex}>{value}</td>;
                            })}
                        </tr>
                    );
                })}
            </tbody>
        </Table>
    );
};

const PivotingPOC = () => {
    return (
        <>
            <RenderTable data={test1} />
        </>
    );
};

export default PivotingPOC;
