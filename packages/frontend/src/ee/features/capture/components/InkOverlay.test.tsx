import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InkOverlay from './InkOverlay';

const rect = new DOMRect(100, 50, 400, 200);

const setup = (holding: boolean) => {
    const onStrokePoint = vi.fn();
    const onStrokeEnd = vi.fn();
    const { container } = render(
        <InkOverlay
            rect={rect}
            holding={holding}
            inkVisible
            strokes={[]}
            fading={null}
            hover={null}
            onStrokePoint={onStrokePoint}
            onStrokeEnd={onStrokeEnd}
            onPick={null}
        />,
    );
    const layer = container.querySelector('[data-holding]') as HTMLElement;
    return { layer, onStrokePoint, onStrokeEnd };
};

describe('InkOverlay', () => {
    it('draws on mouse movement alone while Shift is held, no click needed', () => {
        const { layer, onStrokePoint } = setup(true);
        fireEvent.mouseMove(layer, { clientX: 300, clientY: 150, buttons: 0 });
        expect(onStrokePoint).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
    });

    it('does not draw when Shift is not held', () => {
        const { layer, onStrokePoint } = setup(false);
        fireEvent.mouseMove(layer, { clientX: 300, clientY: 150 });
        expect(onStrokePoint).not.toHaveBeenCalled();
    });

    it('breaks the line when the cursor leaves the area', () => {
        const { layer, onStrokeEnd } = setup(true);
        fireEvent.mouseLeave(layer);
        expect(onStrokeEnd).toHaveBeenCalled();
    });
});
