import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { type LayerMark } from '../types';
import MarkLayer from './MarkLayer';

const mark: LayerMark = {
    bubbleId: 'a',
    number: 2,
    tabUuid: null,
    box: { x: 40, y: 300, width: 120, height: 60 },
    strokes: [
        {
            points: [
                { x: 40, y: 300 },
                { x: 160, y: 360 },
            ],
        },
    ],
    outlined: false,
};

const badgeTop = (container: HTMLElement) =>
    (
        container.querySelector('[data-mark-number="2"]') as HTMLElement
    ).style.getPropertyValue('--mark-top');

describe('MarkLayer', () => {
    it('marks are placed in content coordinates, whatever the scroll', () => {
        const { container } = renderWithProviders(
            <MarkLayer
                clip={null}
                shiftRef={null}
                marks={[mark]}
                colorOf={() => '#1971c2'}
            />,
        );
        expect(badgeTop(container)).toBe('300px');
        expect(container.querySelector('path')).toHaveAttribute(
            'd',
            'M40 300 L160 360',
        );
        expect(container.querySelector('[data-clipped]')).toHaveAttribute(
            'data-clipped',
            'false',
        );
    });

    it('over a surface that scrolls on its own, it is cut off at the surface and can be shifted', () => {
        const shift = { current: null as HTMLDivElement | null };
        const { container } = renderWithProviders(
            <MarkLayer
                clip={new DOMRect(10, 20, 800, 600)}
                shiftRef={shift}
                marks={[mark]}
                colorOf={() => '#1971c2'}
            />,
        );
        const layer = container.querySelector('[data-clipped]') as HTMLElement;
        expect(layer).toHaveAttribute('data-clipped', 'true');
        expect(layer.style.getPropertyValue('--region-top')).toBe('20px');
        expect(
            shift.current?.querySelector('[data-mark-number="2"]'),
        ).not.toBeNull();
    });

    it('a picked element keeps its outline', () => {
        const { container } = renderWithProviders(
            <MarkLayer
                clip={null}
                shiftRef={null}
                marks={[{ ...mark, strokes: [], outlined: true }]}
                colorOf={() => '#1971c2'}
            />,
        );
        const outline = container.querySelector(
            '[data-mark-outline]',
        ) as HTMLElement;
        expect(outline.style.getPropertyValue('--mark-width')).toBe('120px');
    });

    it("each mark is drawn in its own bubble's colour", () => {
        const colors: Record<string, string> = { a: '#e03131', b: '#1971c2' };
        const { container } = renderWithProviders(
            <MarkLayer
                clip={null}
                shiftRef={null}
                marks={[
                    mark,
                    { ...mark, bubbleId: 'b', number: 1, outlined: true },
                ]}
                colorOf={(bubbleId) => colors[bubbleId]}
            />,
        );
        const [first, second] = [...container.querySelectorAll('path')];
        expect(first).toHaveAttribute('stroke', '#e03131');
        expect(second).toHaveAttribute('stroke', '#1971c2');
        const colorOn = (selector: string) =>
            (
                container.querySelector(selector) as HTMLElement
            ).style.getPropertyValue('--bubble-color');
        expect(colorOn('[data-mark-number="2"]')).toBe('#e03131');
        expect(colorOn('[data-mark-number="1"]')).toBe('#1971c2');
        expect(colorOn('[data-mark-outline]')).toBe('#1971c2');
    });
});
