import type { Monaco } from '@monaco-editor/react';
import { describe, expect, it } from 'vitest';
import { registerCustomCompletionProvider } from './monaco';
import type { SqlCatalog } from './sqlCompletionScope';

type Provider = {
    provideCompletionItems: (
        model: unknown,
        position: { lineNumber: number; column: number },
    ) => {
        suggestions: Array<{
            label: unknown;
            insertText: string;
            range: { startColumn: number; endColumn: number };
        }>;
    };
};

const catalog: SqlCatalog = {
    database: 'my-project',
    tablesBySchema: [
        { schema: 'silver', tables: { orders: {}, customers: {} } },
        { schema: 'silver_archive', tables: { orders_2020: {} } },
        { schema: 'gold', tables: { revenue: {} } },
    ],
};

const complete = (line: string, cursor = line.length) => {
    let provider: Provider | undefined;
    const monaco = {
        languages: {
            registerCompletionItemProvider: (_: string, p: Provider) => {
                provider = p;
                return { dispose: () => {} };
            },
            CompletionItemKind: { Module: 8, Class: 5, Field: 3, Variable: 4 },
        },
    } as unknown as Monaco;
    registerCustomCompletionProvider(monaco, 'bigquery', '`', catalog, [
        { name: 'order_id', type: 'string', table: 'orders', schema: 'silver' },
        { name: 'revenue', type: 'number', table: 'revenue', schema: 'gold' },
    ] as never);
    const model = {
        getLineContent: () => line,
        getValueInRange: () => line.slice(0, cursor),
        getWordUntilPosition: () => {
            const word = line.slice(0, cursor).match(/\w*$/)?.[0] ?? '';
            return {
                startColumn: cursor - word.length + 1,
                endColumn: cursor + 1,
            };
        },
    };
    return provider!.provideCompletionItems(model, {
        lineNumber: 1,
        column: cursor + 1,
    }).suggestions;
};

const apply = (
    line: string,
    item: {
        insertText: string;
        range: { startColumn: number; endColumn: number };
    },
) =>
    line.slice(0, item.range.startColumn - 1) +
    item.insertText +
    line.slice(item.range.endColumn - 1);

describe('registerCustomCompletionProvider catalog scoping', () => {
    it('only suggests tables of the typed dataset', () => {
        const line = 'select * from silver.';
        const items = complete(line);
        expect(items.map((i) => i.label)).toEqual(['orders', 'customers']);
        expect(apply(line, items[0])).toBe('select * from silver.`orders`');
    });

    it('resolves the default project to its datasets', () => {
        const items = complete('from `my-project`.');
        expect(items.map((i) => i.label)).toEqual([
            'silver',
            'silver_archive',
            'gold',
        ]);
    });

    it('replaces an open quote and its auto-closed pair', () => {
        const line = 'from silver.`or`';
        const items = complete(line, line.length - 1);
        expect(apply(line, items[0])).toBe('from silver.`orders`');
    });

    it('completes inside a quoted path', () => {
        const line = 'from `silver.or`';
        const items = complete(line, line.length - 1);
        expect(apply(line, items[0])).toBe('from `silver.orders`');
    });

    it('narrows columns to a qualifying table', () => {
        const items = complete('select orders.');
        expect(items.map((i) => i.label)).toEqual([
            'order_id (string) from silver.orders',
        ]);
    });

    it('offers datasets and full table paths when unqualified', () => {
        const labels = complete('from sil').map((i) => i.label);
        expect(labels).toContain('silver');
        expect(labels).toContain('`my-project`.`silver`.`orders`');
    });
});
