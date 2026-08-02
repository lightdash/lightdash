import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { type ContentTableColumnDef } from './types';
import { useContentTable } from './useContentTable';
import { getColumnHeaderLabel } from './utils';

type Row = { name: string; createdAt: string };

const data: Row[] = [
    { name: 'b', createdAt: '2024-01-02T00:00:00Z' },
    { name: 'a', createdAt: '2024-01-01T00:00:00Z' },
];

describe('useContentTable', () => {
    test('builds an accessorFn column that has a string header but no id without throwing', () => {
        const columns: ContentTableColumnDef<Row>[] = [
            {
                accessorFn: (row) => row.createdAt,
                header: 'Current Version',
            },
        ];

        const { result } = renderHook(() =>
            useContentTable<Row>({ columns, data }),
        );

        const column = result.current
            .getAllLeafColumns()
            .find((c) => c.columnDef.header !== undefined && !c.getIsGrouped());

        expect(column).toBeDefined();
        expect(column?.id).toBe('Current Version');
    });

    test('sorts an accessorFn column that has no explicit sortingFn without throwing', () => {
        const columns: ContentTableColumnDef<Row>[] = [
            {
                accessorFn: (row) => row.createdAt,
                id: 'createdAt',
                header: 'Current Version',
            },
        ];

        const { result } = renderHook(() =>
            useContentTable<Row>({
                columns,
                data,
                initialState: { sorting: [{ id: 'createdAt', desc: false }] },
            }),
        );

        const sortedRows = result.current.getSortedRowModel().rows;

        expect(sortedRows.map((r) => r.original.name)).toEqual(['a', 'b']);
    });

    describe('getColumnHeaderLabel', () => {
        test('returns the original string header even though the runtime header is a render callback', () => {
            const columns: ContentTableColumnDef<Row>[] = [
                {
                    accessorKey: 'name',
                    header: 'Metric',
                    Header: ({ column }) => column.columnDef.header,
                },
            ];

            const { result } = renderHook(() =>
                useContentTable<Row>({ columns, data }),
            );

            const [column] = result.current.getAllLeafColumns();

            expect(typeof column.columnDef.header).toBe('function');
            expect(getColumnHeaderLabel(column)).toBe('Metric');
        });

        test('falls back to the column id when the original header is not a string', () => {
            const columns: ContentTableColumnDef<Row>[] = [
                {
                    accessorKey: 'name',
                    id: 'name',
                    header: () => 'rendered',
                },
            ];

            const { result } = renderHook(() =>
                useContentTable<Row>({ columns, data }),
            );

            const [column] = result.current.getAllLeafColumns();

            expect(getColumnHeaderLabel(column)).toBe('name');
        });
    });
});
