import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { type ContentTableColumnDef } from './types';
import { useContentTable } from './useContentTable';

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
});
