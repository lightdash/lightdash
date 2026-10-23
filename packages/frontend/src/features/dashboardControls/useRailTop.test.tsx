import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRailTop, useRailTop } from './useRailTop';

// What the dashboard renders: the tabs and filter bar, stuck under the header
const addStickyBar = (top: string, height: number) => {
    const bar = document.createElement('div');
    bar.setAttribute('data-has-header-above', 'true');
    bar.setAttribute('data-is-stuck', 'false');
    bar.style.top = top;
    Object.defineProperty(bar, 'offsetHeight', { value: height });
    document.body.appendChild(bar);
    return bar;
};

describe('useRailTop', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('puts the rail under the bar: its sticky top plus its height', () => {
        expect(getRailTop(addStickyBar('50px', 96))).toBe(146);
    });

    it('writes the offset on the rail', () => {
        addStickyBar('80px', 40);
        const rail = document.createElement('div');
        renderHook(() => useRailTop({ current: rail }));
        expect(rail.style.getPropertyValue('--controls-rail-top')).toBe(
            '120px',
        );
    });

    it('leaves the stylesheet fallback when there is no bar', () => {
        const rail = document.createElement('div');
        renderHook(() => useRailTop({ current: rail }));
        expect(rail.style.getPropertyValue('--controls-rail-top')).toBe('');
    });
});
