import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import type * as TiptapReact from '@tiptap/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { FormulaEditor } from './FormulaEditor';

// tiptap v3's useEditor arms a 1ms self-destruct timer at construction that is
// only cancelled once the component's effects commit. When the commit lands
// late the effects run against an already-destroyed instance, so hand the
// component exactly that: a real Editor that has been destroyed.
vi.mock('@tiptap/react', async (importOriginal) => {
    const actual = await importOriginal<typeof TiptapReact>();
    const useDestroyedEditor: typeof actual.useEditor = (options) => {
        const [editor] = useState(() => {
            const instance = new actual.Editor(options);
            instance.destroy();
            return instance;
        });
        return editor;
    };
    return { ...actual, useEditor: useDestroyedEditor };
});

const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: '',
            schema: '',
            sqlTable: 'orders',
            dimensions: {
                status: {
                    compiledSql: '',
                    tablesReferences: [],
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '',
                    hidden: false,
                },
            },
            metrics: {},
            lineageGraph: {},
        },
    },
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

describe('FormulaEditor', () => {
    it('renders when the editor was destroyed before effects committed', () => {
        expect(() =>
            renderWithProviders(
                <FormulaEditor
                    explore={explore}
                    metricQuery={metricQuery}
                    initialContent="1 + 1"
                    referenceOpened={false}
                    onReferenceToggle={() => {}}
                />,
            ),
        ).not.toThrow();
    });
});
