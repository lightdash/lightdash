import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    useVizActions,
    type VizActionPoint,
} from '../template/src/lib/viz-actions';

const row = {
    'orders.total_revenue': { value: { raw: 1234, formatted: '$1,234' } },
};

const point: VizActionPoint = {
    key: 'revenue:0',
    row,
    metric: 'revenue',
    fieldId: 'orders.total_revenue',
    label: 'Enterprise',
    formattedValue: '$1,234',
};

function Mark({
    point: pointValue = point,
    markVersion = 0,
    remountOnActivate = false,
    markElement = 'html',
    underlyingData = { enabled: true, open: vi.fn().mockResolvedValue(undefined) },
    drillDown = { enabled: true, open: vi.fn().mockResolvedValue(undefined) },
}: {
    point?: VizActionPoint;
    markVersion?: number;
    remountOnActivate?: boolean;
    markElement?: 'html' | 'svg';
    underlyingData?: { enabled: boolean; open: ReturnType<typeof vi.fn> };
    drillDown?: { enabled: boolean; open: ReturnType<typeof vi.fn> };
}) {
    const [version, setVersion] = useState(markVersion);
    const { getMarkProps, menu, tooltipVisible } = useVizActions({
        underlyingData,
        drillDown,
    });
    const { ref, ...props } = getMarkProps(pointValue);

    return (
        <div
            onKeyDownCapture={(event) => {
                if (
                    remountOnActivate &&
                    (event.key === 'Enter' || event.key === ' ')
                ) {
                    setVersion((value) => value + 1);
                }
            }}
        >
            {markElement === 'svg' ? (
                <svg>
                    <rect
                        key={version}
                        ref={ref}
                        data-testid="mark"
                        data-version={version}
                        {...props}
                    />
                </svg>
            ) : (
                <div
                    key={version}
                    ref={ref}
                    data-testid="mark"
                    data-version={version}
                    {...props}
                />
            )}
            <output data-testid="tooltip">{String(tooltipVisible)}</output>
            {menu}
        </div>
    );
}

describe('useVizActions', () => {
    afterEach(() => cleanup());

    it('opens a pointer-anchored menu and preserves the source row identity', () => {
        const underlyingOpen = vi.fn().mockResolvedValue(undefined);
        const drillOpen = vi.fn().mockResolvedValue(undefined);
        render(
            <Mark
                underlyingData={{ enabled: true, open: underlyingOpen }}
                drillDown={{ enabled: true, open: drillOpen }}
            />,
        );

        const mark = screen.getByTestId('mark');
        fireEvent.pointerMove(mark, { clientX: 20, clientY: 30 });
        fireEvent.click(mark, { detail: 1, clientX: 20, clientY: 30 });

        expect(screen.getByTestId('tooltip')).toHaveTextContent('false');
        expect(document.querySelector('[aria-haspopup="menu"]')).toHaveStyle({
            left: '20px',
            top: '30px',
        });
        fireEvent.click(screen.getByRole('menuitem', { name: 'View underlying data' }));
        expect(underlyingOpen).toHaveBeenCalledWith({
            row,
            metric: 'revenue',
            fieldId: 'orders.total_revenue',
        });
        expect(drillOpen).not.toHaveBeenCalled();
        expect(screen.getByTestId('tooltip')).toHaveTextContent('false');
        fireEvent.pointerMove(document.body);
        expect(screen.getByTestId('tooltip')).toHaveTextContent('true');

        fireEvent.click(mark, { detail: 1, clientX: 20, clientY: 30 });
        expect(screen.getByTestId('tooltip')).toHaveTextContent('false');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Drill into $1,234' }));
        expect(drillOpen).toHaveBeenCalledWith({
            row,
            metric: 'revenue',
            fieldId: 'orders.total_revenue',
        });
    });

    it('gates each action and removes interactive mark semantics when none are allowed', () => {
        const { rerender } = render(
            <Mark
                underlyingData={{ enabled: false, open: vi.fn() }}
                drillDown={{ enabled: true, open: vi.fn() }}
            />,
        );

        const mark = screen.getByTestId('mark');
        expect(mark).toHaveAttribute('role', 'button');
        fireEvent.click(mark, { detail: 1, clientX: 20, clientY: 30 });
        expect(screen.getByRole('menuitem', { name: 'Drill into $1,234' })).toBeVisible();
        expect(screen.queryByRole('menuitem', { name: 'View underlying data' })).toBeNull();
        rerender(
            <Mark
                underlyingData={{ enabled: false, open: vi.fn() }}
                drillDown={{ enabled: false, open: vi.fn() }}
            />,
        );
        expect(screen.getByTestId('mark')).not.toHaveAttribute('role');
        expect(screen.getByTestId('mark')).not.toHaveAttribute('tabindex');
        fireEvent.click(screen.getByTestId('mark'), { detail: 1, clientX: 20, clientY: 30 });
        expect(screen.queryByRole('menu')).toBeNull();

        rerender(
            <Mark
                underlyingData={{ enabled: true, open: vi.fn() }}
                drillDown={{ enabled: false, open: vi.fn() }}
            />,
        );
        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.click(screen.getByTestId('mark'), { detail: 1, clientX: 20, clientY: 30 });
        expect(screen.getByRole('menuitem', { name: 'View underlying data' })).toBeVisible();
        expect(screen.queryByRole('menuitem', { name: /Drill into/ })).toBeNull();
    });

    it('restores keyboard focus to the current keyed mark after the menu unmounts', async () => {
        render(
            <StrictMode>
                <Mark remountOnActivate markElement="svg" />
            </StrictMode>,
        );
        const mark = screen.getByTestId('mark');
        vi.spyOn(mark, 'getBoundingClientRect').mockReturnValue({
            x: 10,
            y: 10,
            top: 10,
            left: 10,
            right: 30,
            bottom: 30,
            width: 20,
            height: 20,
            toJSON: () => ({}),
        });

        mark.focus();
        fireEvent.keyDown(mark, { key: 'Enter' });
        expect(screen.getByRole('menu')).toBeVisible();
        expect(screen.getByTestId('mark')).toHaveAttribute('data-version', '1');
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        await waitFor(() => {
            expect(screen.getByTestId('mark')).toHaveFocus();
            expect(screen.getByTestId('mark')).toHaveAttribute('data-version', '1');
        });
    }, 30_000);
});
