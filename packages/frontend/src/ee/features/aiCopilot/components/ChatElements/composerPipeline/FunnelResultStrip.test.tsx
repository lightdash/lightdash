import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { FunnelResultStrip } from './FunnelResultStrip';

const row = (
    stepOrder: number,
    stepName: string,
    totalUsers: number,
    breakdownValue: string,
) => ({ stepOrder, stepName, totalUsers, breakdownValue });

describe('FunnelResultStrip', () => {
    it('sums each step across breakdown values, in step order', () => {
        renderWithProviders(
            <FunnelResultStrip
                rows={[
                    row(2, 'add_to_cart', 300, 'mobile'),
                    row(1, 'page_view', 1000, 'desktop'),
                    row(1, 'page_view', 600, 'mobile'),
                    row(2, 'add_to_cart', 500, 'desktop'),
                    row(3, 'checkout', 200, 'desktop'),
                ]}
            />,
        );
        const steps = screen
            .getAllByTestId('funnel-strip-step')
            .map((el) => el.textContent);
        expect(steps).toEqual([
            `1Page view${(1600).toLocaleString()}100.0%users`,
            '2Add to cart80050.0%50.0% of previous',
            '3Checkout20012.5%25.0% of previous',
        ]);
        expect(screen.getByTestId('funnel-strip-headline').textContent).toBe(
            `12.5% converted${(1600).toLocaleString()} → 200 users · largest drop at Checkout (−75.0%)`,
        );
    });
});
