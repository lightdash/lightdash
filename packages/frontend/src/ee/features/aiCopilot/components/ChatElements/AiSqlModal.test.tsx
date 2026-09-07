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

    it('omits the SQL action when SQL is unavailable', () => {
        renderWithProviders(<ViewSqlButton />);
        expect(
            screen.queryByRole('button', { name: 'View SQL' }),
        ).not.toBeInTheDocument();
    });
});
