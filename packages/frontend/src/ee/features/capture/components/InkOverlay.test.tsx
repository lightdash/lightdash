import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InkOverlay from './InkOverlay';

const rect = new DOMRect(100, 50, 400, 200);

const setup = (holding: boolean) => {
    const onHover = vi.fn();
    const onStrokePoint = vi.fn();
    const onStrokeEnd = vi.fn();
    const onPick = vi.fn();
    const { container } = render(
        <InkOverlay
            rect={rect}
            holding={holding}
            inkVisible
            strokes={[]}
            color="#1971c2"
            fading={null}
            hover={null}
            onHover={onHover}
            onStrokePoint={onStrokePoint}
            onStrokeEnd={onStrokeEnd}
            onPick={onPick}
        />,
    );
    const layer = container.querySelector('[data-holding]') as HTMLElement;
    return { layer, onHover, onStrokePoint, onStrokeEnd, onPick };
};

describe('InkOverlay', () => {
    it('moving with no button down only hovers', () => {
        const { layer, onHover, onStrokePoint } = setup(true);
        fireEvent.mouseMove(layer, { clientX: 300, clientY: 150 });
        expect(onHover).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
        expect(onStrokePoint).not.toHaveBeenCalled();
    });

    it('a press released without moving picks where it was pressed', () => {
        const { layer, onPick, onStrokePoint } = setup(true);
        const down = fireEvent.mouseDown(layer, { clientX: 300, clientY: 150 });
        expect(down).toBe(false);
        fireEvent.mouseMove(layer, { clientX: 302, clientY: 152 });
        fireEvent.mouseUp(layer, { clientX: 302, clientY: 152 });
        expect(onPick).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
        expect(onStrokePoint).not.toHaveBeenCalled();
    });

    it('a press dragged past the threshold draws from the press point', () => {
        const { layer, onPick, onStrokePoint, onStrokeEnd, onHover } =
            setup(true);
        fireEvent.mouseDown(layer, { clientX: 300, clientY: 150 });
        fireEvent.mouseMove(layer, { clientX: 302, clientY: 150 });
        fireEvent.mouseMove(layer, { clientX: 340, clientY: 150 });
        fireEvent.mouseMove(layer, { clientX: 380, clientY: 150 });
        fireEvent.mouseUp(layer, { clientX: 380, clientY: 150 });
        expect(onStrokePoint.mock.calls.map(([p]) => p.x)).toEqual([
            0.5, 0.505, 0.6, 0.7,
        ]);
        expect(onStrokeEnd).toHaveBeenCalledTimes(1);
        expect(onPick).not.toHaveBeenCalled();
        // The outline goes while a stroke is drawn.
        expect(onHover).toHaveBeenLastCalledWith(null);
    });

    it('does nothing when Option is not held', () => {
        const { layer, onStrokePoint, onPick, onHover } = setup(false);
        fireEvent.mouseDown(layer, { clientX: 300, clientY: 150 });
        fireEvent.mouseMove(layer, { clientX: 380, clientY: 150 });
        fireEvent.mouseUp(layer, { clientX: 380, clientY: 150 });
        expect(onStrokePoint).not.toHaveBeenCalled();
        expect(onPick).not.toHaveBeenCalled();
        expect(onHover).not.toHaveBeenCalled();
    });

    it('a stroke that leaves the area ends there, and a press that leaves picks nothing', () => {
        const { layer, onStrokeEnd, onPick } = setup(true);
        fireEvent.mouseDown(layer, { clientX: 300, clientY: 150 });
        fireEvent.mouseMove(layer, { clientX: 340, clientY: 150 });
        fireEvent.mouseLeave(layer);
        expect(onStrokeEnd).toHaveBeenCalledTimes(1);

        fireEvent.mouseDown(layer, { clientX: 300, clientY: 150 });
        fireEvent.mouseLeave(layer);
        fireEvent.mouseUp(layer, { clientX: 300, clientY: 150 });
        expect(onPick).not.toHaveBeenCalled();
    });
});
