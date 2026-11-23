import { useCallback, useLayoutEffect, useRef } from 'react';

const DURATION_MS = 180;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const FAR_PX = 48;
const NUDGE_PX = 8;

/**
 * Slides the container's buttons from where they were to where a layout
 * change put them, each time `layoutKey` changes.
 */
export const useRelocationAnimation = <T extends HTMLElement>(
    layoutKey: boolean,
) => {
    const container = useRef<T>(null);
    const positions = useRef(new Map<Element, DOMRect>());

    const measure = useCallback(() => {
        const node = container.current;
        if (!node) return;
        positions.current = new Map(
            Array.from(node.querySelectorAll('button')).map((button) => [
                button,
                button.getBoundingClientRect(),
            ]),
        );
    }, []);

    // Effects run once the page has already changed, so where things were
    // has to be read while the change is still only being rendered.
    const renderedKey = useRef(layoutKey);
    if (renderedKey.current !== layoutKey) {
        renderedKey.current = layoutKey;
        measure();
    }

    useLayoutEffect(() => {
        const node = container.current;
        if (
            !node ||
            positions.current.size === 0 ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            return;
        }
        node.querySelectorAll('button').forEach((button) => {
            const before = positions.current.get(button);
            if (!before) return;
            const after = button.getBoundingClientRect();
            const dx = before.left - after.left;
            const dy = before.top - after.top;
            if (dx === 0 && dy === 0) return;
            // A long trip would sweep across its neighbours, so it arrives
            // from a few pixels away instead.
            const isFar = Math.hypot(dx, dy) > FAR_PX;
            button.animate(
                isFar
                    ? [
                          {
                              opacity: 0,
                              transform: `translate(${Math.sign(dx) * NUDGE_PX}px, ${Math.sign(dy) * NUDGE_PX}px)`,
                          },
                          { opacity: 1, transform: 'none' },
                      ]
                    : [
                          { transform: `translate(${dx}px, ${dy}px)` },
                          { transform: 'none' },
                      ],
                { duration: DURATION_MS, easing: EASE_OUT },
            );
        });
    }, [layoutKey]);

    return container;
};
