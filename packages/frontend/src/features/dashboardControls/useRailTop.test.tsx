import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRailTop, useRailTop } from './useRailTop';

// What the dashboard renders: the tabs and filter bar, stuck under the header
const addStickyBar = () => {
    const bar = document.createElement('div');
    bar.setAttribute('data-has-header-above', 'true');
    bar.setAttribute('data-is-stuck', 'false');
    document.body.appendChild(bar);
    return bar;
};

// jsdom lays nothing out: the rail reports where the page would put it
const railAt = (top: number) => {
    const rail = document.createElement('div');
    rail.style.position = 'sticky';
    rail.getBoundingClientRect = () =>
        ({
            top,
            bottom: top,
            left: 0,
            right: 0,
            width: 0,
            height: 0,
        }) as DOMRect;
    document.body.appendChild(rail);
    return rail;
};

describe('useRailTop', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.scrollY = 0;
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('measures where the rail sits in the page, scrolled or not', () => {
        const rail = railAt(151);
        expect(getRailTop(rail)).toBe(151);
        // Scrolled, the viewport top is lower by as much
        window.scrollY = 42;
        rail.getBoundingClientRect = () => ({ top: 109 }) as DOMRect;
        expect(getRailTop(rail)).toBe(151);
        // Measured unstuck, and left as it was
        expect(rail.style.position).toBe('sticky');
    });

    it('pins the rail at its own top, and follows the bar as it wraps', () => {
        const bar = addStickyBar();
        const rail = railAt(151);
        renderHook(() => useRailTop({ current: rail }));
        expect(rail.style.getPropertyValue('--controls-rail-offset')).toBe(
            '151px',
        );
        expect(bar).toBeInTheDocument();
    });

    it('measures without a bar too', () => {
        const rail = railAt(120);
        renderHook(() => useRailTop({ current: rail }));
        expect(rail.style.getPropertyValue('--controls-rail-offset')).toBe(
            '120px',
        );
    });
});
