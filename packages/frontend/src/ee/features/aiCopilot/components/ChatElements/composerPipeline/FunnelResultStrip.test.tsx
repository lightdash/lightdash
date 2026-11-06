import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { FunnelResultStrip } from './FunnelResultStrip';
import { funnelStripRowsOf } from './funnelStripRows';

const row = (
    stepOrder: number,
    stepName: string,
    totalUsers: number,
    breakdownValue: string,
) => ({ stepOrder, stepName, totalUsers, breakdownValue });

describe('funnelStripRowsOf', () => {
    it('reads the fixed funnel columns from result rows', () => {
        const cell = (raw: unknown) => ({
            value: { raw, formatted: String(raw) },
        });
        expect(
            funnelStripRowsOf([
                {
                    step_order: cell(2),
                    step_name: cell('add_to_cart'),
                    total_users: cell(300),
                    breakdown_value: cell('mobile'),
                },
                {
                    step_order: cell(1),
                    step_name: cell('page_view'),
                    total_users: cell(1000),
                },
            ]),
        ).toEqual([
            row(2, 'add_to_cart', 300, 'mobile'),
            { ...row(1, 'page_view', 1000, ''), breakdownValue: null },
        ]);
    });
});

const funnelSteps = [
    { stepOrder: 1, eventName: 'page_view' },
    { stepOrder: 2, eventName: 'add_to_cart' },
    { stepOrder: 3, eventName: 'checkout' },
];

describe('FunnelResultStrip', () => {
    it('sums each step across breakdown values, in step order', () => {
        renderWithProviders(
            <FunnelResultStrip
                steps={funnelSteps}
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
            `1Page view${(1600).toLocaleString()}100.0%`,
            '2Add to cart80050.0%',
            '3Checkout20012.5%',
        ]);
        expect(
            screen
                .getAllByTestId('funnel-strip-drop')
                .map((el) => el.textContent),
        ).toEqual(['800 dropped off (50.0%)', '600 dropped off (75.0%)']);
        expect(screen.getByTestId('funnel-strip-headline').textContent).toBe(
            `12.5% converted${(1600).toLocaleString()} → 200 users · largest drop at Checkout (−75.0%)`,
        );
    });

    it('shows a step nobody reached, which a breakdown returns no rows for', () => {
        renderWithProviders(
            <FunnelResultStrip
                steps={funnelSteps}
                rows={[
                    row(1, 'page_view', 100, 'desktop'),
                    row(2, 'add_to_cart', 50, 'desktop'),
                ]}
            />,
        );
        expect(
            screen
                .getAllByTestId('funnel-strip-step')
                .map((el) => el.textContent),
        ).toEqual([
            '1Page view100100.0%',
            '2Add to cart5050.0%',
            '3Checkout00.0%',
        ]);
        expect(screen.getByTestId('funnel-strip-headline').textContent).toBe(
            '0.0% converted100 → 0 users · largest drop at Checkout (−100.0%)',
        );
    });

    it('states no drop-off rate after a step nobody reached', () => {
        renderWithProviders(
            <FunnelResultStrip
                steps={[...funnelSteps, { stepOrder: 4, eventName: 'paid' }]}
                rows={[
                    row(1, 'page_view', 100, 'desktop'),
                    row(2, 'add_to_cart', 50, 'desktop'),
                ]}
            />,
        );
        expect(
            screen
                .getAllByTestId('funnel-strip-step')
                .map((el) => el.textContent),
        ).toEqual([
            '1Page view100100.0%',
            '2Add to cart5050.0%',
            '3Checkout00.0%',
            '4Paid00.0%',
        ]);
        expect(
            screen
                .getAllByTestId('funnel-strip-drop')
                .map((el) => el.textContent),
        ).toEqual(['50 dropped off (50.0%)', '50 dropped off (100.0%)']);
        expect(screen.getByTestId('funnel-strip-headline').textContent).toBe(
            '0.0% converted100 → 0 users · largest drop at Checkout (−100.0%)',
        );
    });
});
