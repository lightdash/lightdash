import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartTypeSavedQueryPoc } from './ChartTypeSavedQueryPoc';

describe('ChartTypeSavedQueryPoc', () => {
    it('supports keyboard selection and invalidates a preview when the query changes', async () => {
        const user = userEvent.setup();
        render(
            <MantineProvider>
                <ChartTypeSavedQueryPoc />
            </MantineProvider>,
        );

        await user.type(
            screen.getByRole('textbox', { name: 'Search saved queries' }),
            'region',
        );
        expect(
            screen.getByRole('button', { name: /orders by region/i }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: /monthly revenue/i }),
        ).not.toBeInTheDocument();

        await user.tab();
        await user.keyboard('{Enter}');
        expect(
            screen.getByRole('button', { name: /orders by region/i }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Selected query fields')).toBeVisible();
        expect(screen.getByText('Completed orders')).toBeVisible();

        const build = screen.getByRole('button', { name: 'Build chart type' });
        expect(build).toBeDisabled();

        await user.type(
            screen.getByRole('textbox', {
                name: '2. Describe your chart type',
            }),
            'Compare order volume by region',
        );
        await user.tab();
        expect(build).toHaveFocus();
        await user.keyboard('{Enter}');

        expect(screen.getByText('Chart preview')).toBeVisible();
        expect(
            screen.getByRole('img', { name: 'Orders by region bar chart' }),
        ).toBeVisible();
        expect(screen.getByRole('table')).toBeVisible();

        await user.clear(
            screen.getByRole('textbox', { name: 'Search saved queries' }),
        );
        await user.click(
            screen.getByRole('button', { name: /monthly revenue/i }),
        );

        expect(screen.queryByText('Chart preview')).not.toBeInTheDocument();
        expect(
            screen.getByText('Add a description to build a preview.'),
        ).toBeVisible();
    });
});
