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
    it('marks are placed in content coordinates and move with scroll', () => {
        const region = new DOMRect(0, 0, 800, 600);
        const { container, rerender } = renderWithProviders(
            <MarkLayer
                region={region}
                scroll={{ x: 0, y: 200 }}
                marks={[mark]}
            />,
        );
        expect(badgeTop(container)).toBe('100px');
        expect(container.querySelector('g')).toHaveAttribute(
            'transform',
            'translate(0 -200)',
        );

        rerender(
            <MarkLayer
                region={region}
                scroll={{ x: 0, y: 250 }}
                marks={[mark]}
            />,
        );
        expect(badgeTop(container)).toBe('50px');
    });

    it('a picked element keeps its outline', () => {
        const { container } = renderWithProviders(
            <MarkLayer
                region={new DOMRect(0, 0, 800, 600)}
                scroll={{ x: 0, y: 0 }}
                marks={[{ ...mark, strokes: [], outlined: true }]}
            />,
        );
        const outline = container.querySelector(
            '[data-mark-outline]',
        ) as HTMLElement;
        expect(outline.style.getPropertyValue('--mark-width')).toBe('120px');
    });
});
