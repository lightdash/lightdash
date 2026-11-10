import { ComparisonDiffTypes } from '@lightdash/common';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FakeResizeObserver,
    resizeObservers,
    resizeTarget,
} from '../../../testing/fakeResizeObserver';
import { renderWithProviders } from '../../../testing/testUtils';
import { BigNumberDisplay } from './BigNumberDisplay';

const baseProps = {
    value: '1,234',
    label: 'Revenue',
    showLabel: true,
    comparison: undefined,
    flipColors: false,
};

const pillClassesFor = (
    direction: ComparisonDiffTypes,
    flipColors: boolean,
) => {
    cleanup();
    renderWithProviders(
        <BigNumberDisplay
            {...baseProps}
            flipColors={flipColors}
            comparison={{
                formattedValue: '+20',
                direction,
                label: undefined,
                tooltip: 'tooltip',
            }}
        />,
    );
    return screen.getByText('+20').parentElement?.className ?? '';
};

describe('BigNumberDisplay', () => {
    it('renders the value and label', () => {
        renderWithProviders(<BigNumberDisplay {...baseProps} />);

        expect(screen.getByTestId('big-number-value')).toHaveTextContent(
            '1,234',
        );
        expect(screen.getByText('Revenue')).toBeInTheDocument();
    });

    it('hides the label', () => {
        renderWithProviders(
            <BigNumberDisplay {...baseProps} showLabel={false} />,
        );

        expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    });

    it('applies a conditional formatting colour to the value', () => {
        renderWithProviders(
            <BigNumberDisplay
                {...baseProps}
                valueColor="light-dark(#ff0000, #ff8888)"
            />,
        );

        expect(screen.getByTestId('big-number-value')).toHaveStyle({
            '--big-number-color': 'light-dark(#ff0000, #ff8888)',
        });
    });

    it('wraps the value when a renderer is supplied', () => {
        renderWithProviders(
            <BigNumberDisplay
                {...baseProps}
                renderValue={(value) => (
                    <button type="button" data-testid="context-menu">
                        {value}
                    </button>
                )}
            />,
        );

        expect(screen.getByTestId('context-menu')).toContainElement(
            screen.getByTestId('big-number-value'),
        );
    });

    it('shows the description on hover over the value', async () => {
        renderWithProviders(
            <BigNumberDisplay
                {...baseProps}
                description="Total revenue for the period"
            />,
        );

        await userEvent.hover(screen.getByTestId('big-number-value'));

        expect(
            await screen.findByText('Total revenue for the period'),
        ).toBeInTheDocument();
    });

    it('shows the description on hover over the label', async () => {
        renderWithProviders(
            <BigNumberDisplay
                {...baseProps}
                description="Total revenue for the period"
            />,
        );

        await userEvent.hover(screen.getByText('Revenue'));

        expect(
            await screen.findByText('Total revenue for the period'),
        ).toBeInTheDocument();
    });

    it('shows the description on hover over a value that has a context menu', async () => {
        renderWithProviders(
            <BigNumberDisplay
                {...baseProps}
                description="Total revenue for the period"
                renderValue={(value) => (
                    <button type="button" data-testid="context-menu">
                        {value}
                    </button>
                )}
            />,
        );

        await userEvent.hover(screen.getByTestId('big-number-value'));

        expect(
            await screen.findByText('Total revenue for the period'),
        ).toBeInTheDocument();
    });

    it('does not render a description tooltip when there is no description', async () => {
        renderWithProviders(<BigNumberDisplay {...baseProps} />);

        await userEvent.hover(screen.getByTestId('big-number-value'));

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    describe('truncated value tooltip', () => {
        const longValue = 'A very long value that does not fit in the tile';
        let clientWidth: number;
        let scrollWidth: number;
        let originalResizeObserver: typeof ResizeObserver;

        beforeEach(() => {
            clientWidth = 120;
            scrollWidth = 600;
            originalResizeObserver = window.ResizeObserver;
            window.ResizeObserver = FakeResizeObserver;
            vi.spyOn(
                Element.prototype,
                'clientWidth',
                'get',
            ).mockImplementation(function (this: Element) {
                return this.getAttribute('data-testid') === 'big-number-value'
                    ? clientWidth
                    : 0;
            });
            vi.spyOn(
                Element.prototype,
                'scrollWidth',
                'get',
            ).mockImplementation(function (this: Element) {
                return this.getAttribute('data-testid') === 'big-number-value'
                    ? scrollWidth
                    : 0;
            });
        });

        afterEach(() => {
            cleanup();
            resizeObservers.clear();
            window.ResizeObserver = originalResizeObserver;
            vi.restoreAllMocks();
        });

        it('shows the full overflowing value alongside its description', async () => {
            renderWithProviders(
                <BigNumberDisplay
                    {...baseProps}
                    value={longValue}
                    description="Description remains available"
                />,
            );

            await userEvent.hover(screen.getByTestId('big-number-value'));

            const tooltip = await screen.findByRole('tooltip');
            expect(within(tooltip).getByText(longValue)).toBeInTheDocument();
            expect(
                within(tooltip).getByText('Description remains available'),
            ).toBeInTheDocument();
        });

        it('rechecks overflow when the value changes in the same container', async () => {
            scrollWidth = 80;
            const { rerender } = renderWithProviders(
                <BigNumberDisplay {...baseProps} />,
            );
            const valueElement = screen.getByTestId('big-number-value');
            await userEvent.hover(valueElement);
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
            await userEvent.unhover(valueElement);

            scrollWidth = 600;
            rerender(<BigNumberDisplay {...baseProps} value={longValue} />);
            expect(screen.getByTestId('big-number-value')).toBe(valueElement);
            await userEvent.hover(valueElement);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                longValue,
            );
        });

        it('updates overflow after resizing without changing the value', async () => {
            renderWithProviders(
                <BigNumberDisplay {...baseProps} value={longValue} />,
            );
            const valueElement = screen.getByTestId('big-number-value');
            await userEvent.hover(valueElement);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                longValue,
            );
            await userEvent.unhover(valueElement);
            await waitFor(() => {
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
            });

            clientWidth = 800;
            resizeTarget(valueElement, clientWidth, 80);
            await userEvent.hover(valueElement);
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
            await userEvent.unhover(valueElement);

            clientWidth = 120;
            resizeTarget(valueElement, clientWidth, 80);
            await userEvent.hover(valueElement);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                longValue,
            );
        });

        it('measures the replacement value element when a context menu is added', async () => {
            clientWidth = 800;
            const { rerender } = renderWithProviders(
                <BigNumberDisplay {...baseProps} value={longValue} />,
            );
            const originalValueElement = screen.getByTestId('big-number-value');

            clientWidth = 120;
            rerender(
                <BigNumberDisplay
                    {...baseProps}
                    value={longValue}
                    renderValue={(value) => (
                        <button type="button">{value}</button>
                    )}
                />,
            );

            const valueElement = screen.getByTestId('big-number-value');
            expect(valueElement).not.toBe(originalValueElement);
            await userEvent.hover(valueElement);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                longValue,
            );
        });
    });

    it('colours an increase green and a decrease red', () => {
        expect(pillClassesFor(ComparisonDiffTypes.POSITIVE, false)).toContain(
            'trendPillUp',
        );
        expect(pillClassesFor(ComparisonDiffTypes.NEGATIVE, false)).toContain(
            'trendPillDown',
        );
    });

    it('swaps the comparison colours when flipColors is on', () => {
        expect(pillClassesFor(ComparisonDiffTypes.POSITIVE, true)).toContain(
            'trendPillDown',
        );
        expect(pillClassesFor(ComparisonDiffTypes.NEGATIVE, true)).toContain(
            'trendPillUp',
        );
    });

    it('renders an unchanged comparison neutrally', () => {
        expect(pillClassesFor(ComparisonDiffTypes.NONE, false)).toContain(
            'trendPillNeutral',
        );
    });
});
