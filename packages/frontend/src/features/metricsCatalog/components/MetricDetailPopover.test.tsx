import { MetricType } from '@lightdash/common';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { metricsCatalogSlice } from '../store/metricsCatalogSlice';
import { MetricDetailPopover } from './MetricDetailPopover';

describe('metric details', () => {
    it('opens by keyboard, toggles compiled SQL and dismisses with Escape', async () => {
        const user = userEvent.setup();
        const store = configureStore({
            reducer: { metricsCatalog: metricsCatalogSlice.reducer },
        });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity } },
        });
        queryClient.setQueryData(['metric', 'project', 'orders', 'revenue'], {
            name: 'revenue',
            label: 'Revenue',
            table: 'orders',
            tableLabel: 'Orders',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            compiledSql: 'SUM("orders".amount)',
        });
        renderWithProviders(
            <QueryClientProvider client={queryClient}>
                <Provider store={store}>
                    <MetricDetailPopover
                        projectUuid="project"
                        tableName="orders"
                        metricName="revenue"
                        metricLabel="Revenue"
                        showExploreButton
                    >
                        Revenue
                    </MetricDetailPopover>
                </Provider>
            </QueryClientProvider>,
        );

        const trigger = screen.getByRole('button', {
            name: 'Details for Revenue',
        });
        trigger.focus();
        await user.keyboard('{Enter}');
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        const compiledToggle = screen.getByRole('button', {
            name: 'Compiled SQL',
        });
        compiledToggle.focus();
        await user.keyboard(' ');
        expect(compiledToggle).toHaveAttribute('aria-pressed', 'true');
        expect(document.querySelector('code')).toHaveTextContent(
            'SUM("orders".amount)',
        );
        await user.keyboard('{Escape}');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        await user.click(trigger);
        await user.click(screen.getByRole('button', { name: 'Explore' }));
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(
            store.getState().metricsCatalog.modals.metricExploreModal,
        ).toEqual({
            isOpen: true,
            metric: { name: 'revenue', tableName: 'orders' },
        });
    });
});
