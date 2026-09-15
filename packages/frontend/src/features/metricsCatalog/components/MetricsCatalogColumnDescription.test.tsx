import { configureStore } from '@reduxjs/toolkit';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { metricsCatalogSlice } from '../store/metricsCatalogSlice';
import { MetricsCatalogColumnDescription } from './MetricsCatalogColumnDescription';

vi.unmock('@uiw/react-markdown-preview');

describe('catalog descriptions', () => {
    afterEach(() => vi.restoreAllMocks());

    it('opens clamped Markdown by keyboard and returns focus after Escape', async () => {
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
            800,
        );
        const user = userEvent.setup();
        const store = configureStore({
            reducer: { metricsCatalog: metricsCatalogSlice.reducer },
        });
        renderWithProviders(
            <Provider store={store}>
                <MetricsCatalogColumnDescription
                    metricLabel="Revenue"
                    description="Revenue methodology. [Documentation](https://docs.lightdash.com/)"
                />
            </Provider>,
        );

        const trigger = await screen.findByRole('button', {
            name: 'Read full description for Revenue',
        });
        trigger.focus();
        await user.keyboard('{Enter}');
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('link', { name: 'Documentation' }),
        ).toHaveAttribute('href', 'https://docs.lightdash.com/');
        expect(within(dialog).getByRole('link').closest('button')).toBeNull();
        await user.keyboard('{Escape}');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await waitFor(() => expect(trigger).toHaveFocus());
        await waitFor(() =>
            expect(
                store.getState().metricsCatalog.popovers.description.isClosing,
            ).toBe(false),
        );

        await user.keyboard('{Enter}');
        await user.click(
            screen.getByRole('button', { name: 'Close description' }),
        );
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('does not offer expansion for an empty description', () => {
        const store = configureStore({
            reducer: { metricsCatalog: metricsCatalogSlice.reducer },
        });
        renderWithProviders(
            <Provider store={store}>
                <MetricsCatalogColumnDescription
                    metricLabel="Revenue"
                    description={undefined}
                />
            </Provider>,
        );
        expect(
            screen.queryByRole('button', {
                name: 'Read full description for Revenue',
            }),
        ).not.toBeInTheDocument();
    });
});
