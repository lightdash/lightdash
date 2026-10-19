import { getMergeCompiledSqlText, WarehouseTypes } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ViewSqlButton } from './ViewSqlButton';

describe('AI agent SQL modal', () => {
    it('formats the display and copies the original SQL unchanged', async () => {
        const user = userEvent.setup();
        const sql = '  select customer_id, first_name from customers;\n';
        renderWithProviders(<ViewSqlButton sql={sql} />);

        await user.click(screen.getByRole('button', { name: 'View SQL' }));

        const code = document.querySelector('.mantine-CodeHighlight-code');
        expect(code?.textContent).toContain('customer_id,\n');
        expect(code?.textContent).toContain('  first_name');
        expect(code?.textContent).not.toBe(sql.trim());

        await user.click(screen.getByRole('button', { name: 'Copy SQL' }));
        expect(await navigator.clipboard.readText()).toBe(sql);
        expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps unsupported SQL visible and copyable', async () => {
        const user = userEvent.setup();
        const sql = 'SELECT {{ unresolved_template }} FROM customers;';
        renderWithProviders(<ViewSqlButton sql={sql} />);

        await user.click(screen.getByRole('button', { name: 'View SQL' }));
        expect(
            document.querySelector('.mantine-CodeHighlight-code')?.textContent,
        ).toBe(sql);

        await user.click(screen.getByRole('button', { name: 'Copy SQL' }));
        expect(await navigator.clipboard.readText()).toBe(sql);
    });

    it('keeps merged SQL sections and comments as formatted', async () => {
        const user = userEvent.setup();
        const sql = getMergeCompiledSqlText(
            {
                legs: [
                    {
                        sourceId: 'orders',
                        sql: 'select a, b from orders',
                        metricQuery: null,
                    },
                    {
                        sourceId: 'payments',
                        sql: 'select a, c from payments',
                        metricQuery: null,
                    },
                ],
                sql: 'select * from merge_source_0 join merge_source_1 using (a)',
            },
            WarehouseTypes.POSTGRES,
        );
        if (sql === null) throw new Error('merge did not compile');
        renderWithProviders(<ViewSqlButton sql={sql} isFormatted />);

        await user.click(screen.getByRole('button', { name: 'View SQL' }));
        const code = document.querySelector(
            '.mantine-CodeHighlight-code',
        )?.textContent;
        expect(code).toBe(sql);
        expect(code).toContain('\n\n-- Query B ("payments")');
        expect(code).toContain('\n\n-- Merge:');

        await user.click(screen.getByRole('button', { name: 'Copy SQL' }));
        expect(await navigator.clipboard.readText()).toBe(sql);
    });

    it('omits the SQL action when SQL is unavailable', () => {
        renderWithProviders(<ViewSqlButton />);
        expect(
            screen.queryByRole('button', { name: 'View SQL' }),
        ).not.toBeInTheDocument();
    });
});
